-- Separate staff messaging from customer support, support staff-to-staff DMs,
-- and provide recoverable archive/trash actions without hard-deleting history.

alter table public.chat_conversations
  add column if not exists conversation_type text not null default 'customer_support',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

alter table public.chat_conversations
  drop constraint if exists chat_conversations_type_check;
alter table public.chat_conversations
  add constraint chat_conversations_type_check
  check (conversation_type in ('customer_support', 'staff_group', 'staff_direct', 'telegram_group'));

-- Classify pre-existing internal and Telegram threads before enabling the
-- separate inbox views. Guest/customer conversations remain customer support.
update public.chat_conversations conversation
set conversation_type = 'telegram_group'
where conversation.conversation_type <> 'telegram_group'
  and exists (
    select 1 from public.telegram_group_bindings binding
    where binding.conversation_id = conversation.id
  );
update public.chat_conversations conversation
set conversation_type = 'staff_group'
where conversation.conversation_type = 'customer_support'
  and (conversation.reference like 'INT-%' or conversation.guest_name ilike 'Internal · %')
  and not exists (
    select 1 from public.telegram_group_bindings binding
    where binding.conversation_id = conversation.id
  );

create index if not exists chat_conversations_workspace_type_updated_idx
  on public.chat_conversations (workspace_id, conversation_type, updated_at desc)
  where deleted_at is null;
create index if not exists chat_conversations_workspace_archived_idx
  on public.chat_conversations (workspace_id, archived_at, updated_at desc)
  where deleted_at is null;
create index if not exists chat_conversations_workspace_deleted_idx
  on public.chat_conversations (workspace_id, deleted_at desc)
  where deleted_at is not null;

create or replace function private.chat_mark_telegram_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active then
    update public.chat_conversations
    set conversation_type = 'telegram_group'
    where id = new.conversation_id and workspace_id = new.workspace_id;
  end if;
  return new;
end;
$$;
revoke all on function private.chat_mark_telegram_conversation() from public, anon, authenticated;
drop trigger if exists chat_mark_telegram_conversation on public.telegram_group_bindings;
create trigger chat_mark_telegram_conversation
  after insert or update on public.telegram_group_bindings
  for each row execute function private.chat_mark_telegram_conversation();

create table if not exists public.chat_conversation_participants (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
create index if not exists chat_conversation_participants_profile_idx
  on public.chat_conversation_participants (profile_id, conversation_id);
alter table public.chat_conversation_participants enable row level security;
revoke all on public.chat_conversation_participants from public, anon, authenticated;

create or replace function private.chat_is_conversation_participant(
  conversation_id_input uuid,
  profile_id_input uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_conversation_participants participant
    join public.chat_conversations conversation on conversation.id = participant.conversation_id
    join public.profiles profile on profile.id = participant.profile_id
    where participant.conversation_id = conversation_id_input
      and participant.profile_id = profile_id_input
      and profile_id_input = (select auth.uid())
      and profile.is_active = true
      and profile.account_type = 'staff'
      and profile.workspace_id = conversation.workspace_id
  );
$$;
revoke all on function private.chat_is_conversation_participant(uuid, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.chat_is_conversation_participant(uuid, uuid) to authenticated;

-- A roster member can open a direct staff thread without creating a task or
-- supplying a topic. The pair lock and existing-thread lookup avoid duplicate
-- direct conversations on concurrent clicks.
create or replace function public.start_internal_direct_chat(recipient_profile_input uuid)
returns table(conversation_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  workspace_id_value uuid;
  actor_name text;
  recipient_name text;
  conversation_id_value uuid;
  reference_value text;
begin
  select profile.workspace_id, coalesce(nullif(trim(profile.full_name), ''), 'Betanor staff')
  into workspace_id_value, actor_name
  from public.profiles profile
  where profile.id = actor_id
    and profile.is_active = true
    and profile.account_type = 'staff';

  select coalesce(nullif(trim(profile.full_name), ''), 'Betanor colleague')
  into recipient_name
  from public.profiles profile
  where profile.id = recipient_profile_input
    and profile.workspace_id = workspace_id_value
    and profile.is_active = true
    and profile.account_type = 'staff';

  if actor_id is null or workspace_id_value is null or recipient_name is null
     or actor_id = recipient_profile_input
     or not (private.has_permission('chat.manage', workspace_id_value)
       or private.has_permission('chat.internal.read', workspace_id_value)) then
    raise exception 'A same-workspace staff recipient and chat access are required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    least(actor_id::text, recipient_profile_input::text) || ':' || greatest(actor_id::text, recipient_profile_input::text), 0
  ));

  select conversation.id, conversation.reference
  into conversation_id_value, reference_value
  from public.chat_conversations conversation
  where conversation.workspace_id = workspace_id_value
    and conversation.conversation_type = 'staff_direct'
    and conversation.deleted_at is null
    and exists (
      select 1 from public.chat_conversation_participants participant
      where participant.conversation_id = conversation.id and participant.profile_id = actor_id
    )
    and exists (
      select 1 from public.chat_conversation_participants participant
      where participant.conversation_id = conversation.id and participant.profile_id = recipient_profile_input
    )
    and (
      select count(*) from public.chat_conversation_participants participant
      where participant.conversation_id = conversation.id
    ) = 2
  order by conversation.updated_at desc
  limit 1;

  if conversation_id_value is not null then
    update public.chat_conversations
    set archived_at = null, archived_by = null, updated_at = now()
    where id = conversation_id_value;
    return query select conversation_id_value, reference_value;
    return;
  end if;

  reference_value := 'DM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.chat_conversations (
    workspace_id, reference, guest_name, topic, status, priority, conversation_type
  ) values (
    workspace_id_value,
    reference_value,
    'Staff · ' || actor_name || ' / ' || recipient_name,
    null,
    'open',
    'medium',
    'staff_direct'
  ) returning id into conversation_id_value;

  insert into public.chat_conversation_participants (conversation_id, profile_id, added_by)
  values
    (conversation_id_value, actor_id, actor_id),
    (conversation_id_value, recipient_profile_input, actor_id);

  return query select conversation_id_value, reference_value;
end;
$$;
revoke all on function public.start_internal_direct_chat(uuid) from public, anon;
grant execute on function public.start_internal_direct_chat(uuid) to authenticated;

create or replace function public.list_chat_staff_roster()
returns table(profile_id uuid, display_name text, job_title text, employee_number text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  workspace_id_value uuid;
begin
  select profile.workspace_id into workspace_id_value
  from public.profiles profile
  where profile.id = (select auth.uid()) and profile.is_active = true;

  if workspace_id_value is null
     or not private.is_active_staff_profile((select auth.uid()))
     or not (private.has_permission('chat.manage', workspace_id_value)
       or private.has_permission('chat.internal.read', workspace_id_value)) then
    raise exception 'Not authorized to view the staff chat roster.' using errcode = '42501';
  end if;

  return query
  select distinct
    profile.id,
    coalesce(nullif(trim(profile.full_name), ''), 'Betanor colleague'),
    profile.job_title,
    employee.employee_number
  from public.profiles profile
  join public.user_roles user_role on user_role.user_id = profile.id
  join public.roles role on role.id = user_role.role_id and role.role_type = 'staff'
  left join public.employees employee
    on employee.profile_id = profile.id
   and employee.workspace_id = workspace_id_value
   and employee.employment_status = 'active'
  where profile.workspace_id = workspace_id_value
    and profile.is_active = true
    and profile.account_type = 'staff'
  order by 2;
end;
$$;
revoke all on function public.list_chat_staff_roster() from public, anon;
grant execute on function public.list_chat_staff_roster() to authenticated;

drop policy if exists "chat staff read workspace presence" on public.chat_staff_presence;
create policy "chat staff read workspace presence"
  on public.chat_staff_presence for select to authenticated
  using (
    (private.has_permission('chat.manage', workspace_id)
      or private.has_permission('chat.internal.read', workspace_id))
    and exists (
      select 1 from public.profiles actor
      where actor.id = (select auth.uid())
        and actor.workspace_id = chat_staff_presence.workspace_id
        and actor.is_active = true
        and private.is_active_staff_profile(actor.id)
    )
    and private.is_active_staff_profile(profile_id)
  );

create or replace function public.heartbeat_chat_staff_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_workspace_id uuid;
begin
  select profile.workspace_id into actor_workspace_id
  from public.profiles profile
  where profile.id = actor_id and profile.is_active = true and profile.workspace_id is not null;

  if actor_id is null
     or actor_workspace_id is null
     or not private.is_active_staff_profile(actor_id)
     or not (private.has_permission('chat.manage', actor_workspace_id)
       or private.has_permission('chat.internal.read', actor_workspace_id)) then
    raise exception 'Not authorized to update staff presence.' using errcode = '42501';
  end if;

  insert into public.chat_staff_presence(profile_id, workspace_id, last_seen_at)
  values (actor_id, actor_workspace_id, now())
  on conflict (profile_id) do update
    set workspace_id = excluded.workspace_id, last_seen_at = now();
end;
$$;
revoke all on function public.heartbeat_chat_staff_presence() from public, anon;
grant execute on function public.heartbeat_chat_staff_presence() to authenticated;

-- Permit an empty first message for a simple internal group thread. Customer
-- support requests continue using their own guest/customer RPCs.
create or replace function public.start_internal_chat(topic_input text, message_input text)
returns table(conversation_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  workspace_id_value uuid;
  display_name text;
  conversation_id_value uuid;
  reference_value text;
  body_value text := trim(coalesce(message_input, ''));
begin
  select profile.workspace_id, coalesce(nullif(trim(profile.full_name), ''), auth_user.email)
  into workspace_id_value, display_name
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.id = actor_id and profile.is_active = true and profile.account_type = 'staff';

  if actor_id is null or workspace_id_value is null
     or not private.has_permission('chat.manage', workspace_id_value)
     or length(body_value) > 10000 then
    raise exception 'Not authorized to start an internal chat.' using errcode = '42501';
  end if;

  reference_value := 'INT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.chat_conversations (
    workspace_id, reference, guest_name, topic, status, priority, conversation_type
  ) values (
    workspace_id_value, reference_value, 'Internal · ' || coalesce(display_name, 'Staff'),
    nullif(trim(topic_input), ''), 'open', 'medium', 'staff_group'
  ) returning id into conversation_id_value;

  if body_value <> '' then
    insert into public.chat_messages (conversation_id, sender_profile_id, sender_kind, body, is_internal)
    values (conversation_id_value, actor_id, 'agent', body_value, true);
  end if;

  return query select conversation_id_value, reference_value;
end;
$$;
revoke all on function public.start_internal_chat(text, text) from public, anon;
grant execute on function public.start_internal_chat(text, text) to authenticated;

-- Staff direct messages are visible only to their participants; customer
-- support and staff group chats remain visible to users with chat.manage.
drop policy if exists "chat agents read conversations" on public.chat_conversations;
create policy "chat agents read conversations"
  on public.chat_conversations for select to authenticated
  using (
    private.has_permission('chat.manage', workspace_id)
    and (
      conversation_type <> 'staff_direct'
      or private.chat_is_conversation_participant(id, (select auth.uid()))
    )
  );
drop policy if exists "staff participants read direct conversations" on public.chat_conversations;
create policy "staff participants read direct conversations"
  on public.chat_conversations for select to authenticated
  using (
    conversation_type = 'staff_direct'
    and private.has_permission('chat.internal.read', workspace_id)
    and private.chat_is_conversation_participant(id, (select auth.uid()))
  );

drop policy if exists "chat agents read messages" on public.chat_messages;
create policy "chat agents read messages"
  on public.chat_messages for select to authenticated
  using (
    exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = chat_messages.conversation_id
        and (
          (private.has_permission('chat.manage', conversation.workspace_id)
            and (conversation.conversation_type <> 'staff_direct'
              or private.chat_is_conversation_participant(conversation.id, (select auth.uid()))))
          or (conversation.conversation_type = 'staff_direct'
            and private.has_permission('chat.internal.read', conversation.workspace_id)
            and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
        )
    )
  );

create or replace function private.chat_unarchive_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_conversations
  set archived_at = null, archived_by = null, updated_at = now()
  where id = new.conversation_id and deleted_at is null and archived_at is not null;
  return new;
end;
$$;
revoke all on function private.chat_unarchive_on_message() from public, anon, authenticated;
drop trigger if exists chat_unarchive_on_message on public.chat_messages;
create trigger chat_unarchive_on_message
  after insert on public.chat_messages
  for each row execute function private.chat_unarchive_on_message();

-- Keep private uploads usable for direct staff participants and inaccessible
-- to customer accounts after a conversation is moved to Trash.
drop policy if exists chat_attachment_upload_admin on storage.objects;
create policy chat_attachment_upload_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'betanor-chat-attachments'
    and exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = case
        when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid
        else null
      end
        and conversation.deleted_at is null
        and (
          (private.has_permission('chat.manage', conversation.workspace_id)
            and (conversation.conversation_type <> 'staff_direct'
              or private.chat_is_conversation_participant(conversation.id, (select auth.uid()))))
          or (conversation.conversation_type = 'staff_direct'
            and private.has_permission('chat.internal.read', conversation.workspace_id)
            and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
          or (conversation.customer_id is not null
            and private.customer_portal_has_access(conversation.customer_id)
            and (conversation.support_ticket_id is null
              or private.has_permission('customer.support.respond', conversation.workspace_id)))
        )
    )
  );

drop policy if exists chat_attachment_read_authorized on storage.objects;
create policy chat_attachment_read_authorized on storage.objects
  for select to authenticated
  using (
    bucket_id = 'betanor-chat-attachments'
    and exists (
      select 1
      from public.chat_messages message
      join public.chat_conversations conversation on conversation.id = message.conversation_id
      where message.attachment_path = storage.objects.name
        and (
          (private.has_permission('chat.manage', conversation.workspace_id)
            and (conversation.conversation_type <> 'staff_direct'
              or private.chat_is_conversation_participant(conversation.id, (select auth.uid()))))
          or (conversation.conversation_type = 'staff_direct'
            and private.has_permission('chat.internal.read', conversation.workspace_id)
            and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
          or (conversation.deleted_at is null
            and conversation.customer_id is not null
            and private.customer_portal_has_access(conversation.customer_id)
            and (conversation.support_ticket_id is null
              or private.has_permission('customer.support.read', conversation.workspace_id)))
        )
    )
  );

drop policy if exists chat_attachment_delete_admin on storage.objects;
create policy chat_attachment_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'betanor-chat-attachments'
    and exists (
      select 1
      from public.chat_messages message
      join public.chat_conversations conversation on conversation.id = message.conversation_id
      where message.attachment_path = storage.objects.name
        and private.has_permission('chat.manage', conversation.workspace_id)
        and (conversation.conversation_type <> 'staff_direct'
          or private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
    )
  );

drop policy if exists "chat staff read pinned activities" on public.chat_message_pins;
create policy "chat staff read pinned activities"
  on public.chat_message_pins for select to authenticated
  using (
    exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = chat_message_pins.conversation_id
        and private.has_permission('chat.manage', conversation.workspace_id)
        and (conversation.conversation_type <> 'staff_direct'
          or private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
    )
  );
drop policy if exists "chat staff pin activities" on public.chat_message_pins;
create policy "chat staff pin activities"
  on public.chat_message_pins for insert to authenticated
  with check (
    pinned_by = (select auth.uid())
    and exists (
      select 1
      from public.chat_messages message
      join public.chat_conversations conversation on conversation.id = message.conversation_id
      where message.id = chat_message_pins.message_id
        and message.conversation_id = chat_message_pins.conversation_id
        and private.has_permission('chat.manage', conversation.workspace_id)
        and (conversation.conversation_type <> 'staff_direct'
          or private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
    )
  );
drop policy if exists "chat staff unpin activities" on public.chat_message_pins;
create policy "chat staff unpin activities"
  on public.chat_message_pins for delete to authenticated
  using (
    exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = chat_message_pins.conversation_id
        and private.has_permission('chat.manage', conversation.workspace_id)
        and (conversation.conversation_type <> 'staff_direct'
          or private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
    )
  );

drop policy if exists "chat agents send messages" on public.chat_messages;
create policy "chat agents send messages"
  on public.chat_messages for insert to authenticated
  with check (
    sender_kind = 'agent'
    and sender_profile_id = (select auth.uid())
    and exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = chat_messages.conversation_id
        and conversation.deleted_at is null
        and (
          (conversation.conversation_type <> 'staff_direct'
            and private.has_permission('chat.manage', conversation.workspace_id))
          or (conversation.conversation_type = 'staff_direct'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
        )
    )
  );

create or replace function public.chat_set_conversation_state(
  conversation_id_input uuid,
  action_input text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  conversation public.chat_conversations%rowtype;
  actor_workspace_id uuid;
begin
  if action_input not in ('archive', 'delete', 'restore') then
    raise exception 'Unsupported conversation action.' using errcode = '22023';
  end if;
  select profile.workspace_id into actor_workspace_id
  from public.profiles profile
  where profile.id = actor_id and profile.is_active = true and profile.account_type = 'staff';

  select * into conversation
  from public.chat_conversations
  where id = conversation_id_input
  for update;

  if actor_workspace_id is null or conversation.id is null
     or conversation.workspace_id <> actor_workspace_id
     or not (
       private.has_permission('chat.manage', actor_workspace_id)
       or (conversation.conversation_type = 'staff_direct'
         and private.chat_is_conversation_participant(conversation.id, actor_id))
     ) then
    raise exception 'You cannot change this conversation.' using errcode = '42501';
  end if;

  if action_input = 'delete' and conversation.support_ticket_id is not null then
    raise exception 'Ticket conversations are retained with the support record; archive this conversation instead.' using errcode = '55000';
  elsif action_input = 'archive' then
    update public.chat_conversations
    set archived_at = coalesce(archived_at, now()), archived_by = coalesce(archived_by, actor_id), updated_at = now()
    where id = conversation.id;
  elsif action_input = 'delete' then
    update public.chat_conversations
    set deleted_at = coalesce(deleted_at, now()), deleted_by = coalesce(deleted_by, actor_id), updated_at = now()
    where id = conversation.id;
  else
    update public.chat_conversations
    set archived_at = null, archived_by = null, deleted_at = null, deleted_by = null, updated_at = now()
    where id = conversation.id;
  end if;
end;
$$;
revoke all on function public.chat_set_conversation_state(uuid, text) from public, anon;
grant execute on function public.chat_set_conversation_state(uuid, text) to authenticated;

-- Keep soft-deleted support threads out of customer-facing authenticated reads.
drop policy if exists "customers read own conversations" on public.chat_conversations;
create policy "customers read own conversations"
  on public.chat_conversations for select to authenticated
  using (
    deleted_at is null
    and customer_id is not null
    and (select private.customer_portal_has_access(customer_id))
  );
drop policy if exists "customers read own public messages" on public.chat_messages;
create policy "customers read own public messages"
  on public.chat_messages for select to authenticated
  using (
    is_internal = false
    and exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = chat_messages.conversation_id
        and conversation.deleted_at is null
        and conversation.customer_id is not null
        and (select private.customer_portal_has_access(conversation.customer_id))
    )
  );
drop policy if exists "customers send own messages" on public.chat_messages;
create policy "customers send own messages"
  on public.chat_messages for insert to authenticated
  with check (
    sender_kind = 'customer'
    and is_internal = false
    and sender_profile_id = (select auth.uid())
    and exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = chat_messages.conversation_id
        and conversation.deleted_at is null
        and conversation.customer_id is not null
        and (select private.customer_portal_has_access(conversation.customer_id))
    )
  );

create or replace function public.start_customer_chat(topic_input text, message_input text)
returns table(conversation_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  customer_id_value uuid;
  workspace_id_value uuid;
  conversation_id_value uuid;
  reference_value text;
  display_name text;
begin
  if actor_id is null or coalesce(length(trim(message_input)), 0) < 2 then
    raise exception 'A message is required.' using errcode = '22023';
  end if;
  select access.customer_id, access.workspace_id
  into customer_id_value, workspace_id_value
  from public.customer_portal_access access
  where access.profile_id = actor_id and access.is_active
  limit 1;
  if customer_id_value is null then
    raise exception 'Customer portal access is required.' using errcode = '42501';
  end if;
  select coalesce(profile.full_name, customer.name)
  into display_name
  from public.profiles profile
  join public.customers customer on customer.id = customer_id_value
  where profile.id = actor_id;
  select conversation.id, conversation.reference
  into conversation_id_value, reference_value
  from public.chat_conversations conversation
  where conversation.customer_id = customer_id_value
    and conversation.deleted_at is null
    and conversation.status not in ('closed', 'resolved')
  order by conversation.updated_at desc
  limit 1;
  if conversation_id_value is null then
    reference_value := format('BTNR-CHAT-%s-%s', to_char(current_date, 'YYYY'), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)));
    insert into public.chat_conversations (workspace_id, customer_id, reference, guest_name, topic, status, conversation_type)
    values (workspace_id_value, customer_id_value, reference_value, display_name, nullif(trim(topic_input), ''), 'waiting', 'customer_support')
    returning id into conversation_id_value;
  end if;
  insert into public.chat_messages (conversation_id, sender_profile_id, sender_kind, body)
  values (conversation_id_value, actor_id, 'customer', trim(message_input));
  update public.chat_conversations set status = 'waiting', updated_at = now() where id = conversation_id_value;
  return query select conversation_id_value, reference_value;
end;
$$;
revoke all on function public.start_customer_chat(text, text) from public, anon;
grant execute on function public.start_customer_chat(text, text) to authenticated;

-- Guest access is token-scoped; a staff move-to-trash action revokes further
-- guest reads and replies while retaining the underlying audit history.
create or replace function public.get_guest_chat(token_input text)
returns table(reference text, guest_name text, topic text, status text, message_id uuid, sender_kind text, body text, created_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select conversation.reference, conversation.guest_name, conversation.topic, conversation.status,
    message.id, message.sender_kind, message.body, message.created_at
  from public.chat_conversations conversation
  join public.chat_messages message on message.conversation_id = conversation.id
  where conversation.deleted_at is null
    and conversation.secure_guest_token_hash = encode(extensions.digest(token_input, 'sha256'), 'hex')
    and length(coalesce(token_input, '')) >= 32
    and message.is_internal = false
  order by message.created_at asc;
$$;

create or replace function public.send_guest_chat_message(token_input text, message_input text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare conversation_id_value uuid;
begin
  if length(coalesce(token_input, '')) < 32 or length(trim(coalesce(message_input, ''))) < 2 then
    return false;
  end if;
  select id into conversation_id_value
  from public.chat_conversations
  where deleted_at is null
    and secure_guest_token_hash = encode(extensions.digest(token_input, 'sha256'), 'hex')
    and status not in ('closed', 'resolved');
  if conversation_id_value is null then return false; end if;
  insert into public.chat_messages (conversation_id, sender_kind, body)
  values (conversation_id_value, 'guest', trim(message_input));
  update public.chat_conversations set status = 'waiting', updated_at = now() where id = conversation_id_value;
  return true;
end;
$$;

create or replace function public.get_guest_chat_session(token_input text)
returns table(conversation_id uuid, conversation_status text)
language sql
security definer
set search_path = ''
as $$
  select conversation.id, conversation.status
  from public.chat_conversations conversation
  where token_input ~ '^[0-9a-fA-F]{64}$'
    and conversation.deleted_at is null
    and conversation.secure_guest_token_hash = encode(extensions.digest(token_input, 'sha256'), 'hex')
  limit 1;
$$;

create or replace function private.chat_message_actor_can_change(p_message public.chat_messages)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_message.sender_profile_id = (select auth.uid())
    and p_message.sender_kind in ('agent', 'customer')
    and p_message.deleted_at is null
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid()) and profile.is_active
    )
    and exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = p_message.conversation_id
        and conversation.deleted_at is null
        and (
          (p_message.sender_kind = 'agent'
            and (
              private.has_permission('chat.manage', conversation.workspace_id)
              or (conversation.conversation_type = 'staff_direct'
                and private.has_permission('chat.internal.read', conversation.workspace_id)
                and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
            ))
          or (p_message.sender_kind = 'customer'
            and conversation.customer_id is not null
            and private.customer_portal_has_access(conversation.customer_id))
        )
    );
$$;
revoke all on function private.chat_message_actor_can_change(public.chat_messages) from public, anon;
grant execute on function private.chat_message_actor_can_change(public.chat_messages) to authenticated;

-- Staff moderators may remove any customer/staff message from the visible
-- thread; authors retain the existing edit/delete permissions for their own.
create or replace function public.chat_delete_message(message_id_input uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  original public.chat_messages%rowtype;
  can_moderate boolean;
begin
  select * into original from public.chat_messages where id = message_id_input for update;
  select exists (
    select 1 from public.chat_conversations conversation
    where conversation.id = original.conversation_id
      and private.has_permission('chat.manage', conversation.workspace_id)
      and (conversation.conversation_type <> 'staff_direct'
        or private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
  ) into can_moderate;
  if original.id is null or original.sender_kind not in ('agent', 'customer', 'guest', 'telegram_group')
     or (original.sender_kind in ('guest', 'telegram_group') and not can_moderate)
     or not (private.chat_message_actor_can_change(original) or can_moderate) then
    raise exception 'You cannot delete this message.' using errcode = '42501';
  end if;
  insert into public.chat_message_revisions(message_id, actor_id, action, previous_body)
  values (original.id, (select auth.uid()), 'delete', original.body);
  update public.chat_messages
  set body = 'Message deleted', deleted_at = now(), deleted_by = (select auth.uid()),
      attachment_path = null, attachment_name = null, attachment_mime_type = null,
      attachment_size_bytes = null
  where id = original.id;
end;
$$;
revoke all on function public.chat_delete_message(uuid) from public, anon;
grant execute on function public.chat_delete_message(uuid) to authenticated;

comment on column public.chat_conversations.conversation_type is
  'Separates customer support, staff group chats, staff direct messages, and Telegram group mirrors.';
comment on column public.chat_conversations.deleted_at is
  'Recoverable soft-delete timestamp. Conversation content and revision/audit records are retained.';
