-- Live internal conversations, participant-scoped staff groups, and admin-managed navigation.

create table if not exists public.workspace_navigation_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  staff_navigation jsonb not null default '{}'::jsonb check (jsonb_typeof(staff_navigation) = 'object'),
  customer_navigation jsonb not null default '{}'::jsonb check (jsonb_typeof(customer_navigation) = 'object'),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_navigation_settings enable row level security;
revoke all on public.workspace_navigation_settings from public, anon, authenticated;
grant select (workspace_id, staff_navigation, customer_navigation) on public.workspace_navigation_settings to anon, authenticated;
grant insert, update on public.workspace_navigation_settings to authenticated;

drop policy if exists "public can read workspace navigation" on public.workspace_navigation_settings;
create policy "public can read workspace navigation"
  on public.workspace_navigation_settings for select to anon, authenticated
  using (true);

drop policy if exists "settings managers create workspace navigation" on public.workspace_navigation_settings;
create policy "settings managers create workspace navigation"
  on public.workspace_navigation_settings for insert to authenticated
  with check ((select private.has_permission('settings.manage', workspace_id)));

drop policy if exists "settings managers update workspace navigation" on public.workspace_navigation_settings;
create policy "settings managers update workspace navigation"
  on public.workspace_navigation_settings for update to authenticated
  using ((select private.has_permission('settings.manage', workspace_id)))
  with check ((select private.has_permission('settings.manage', workspace_id)));

create or replace function private.chat_can_access_group(conversation_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_conversations conversation
    join public.profiles actor
      on actor.id = (select auth.uid())
     and actor.workspace_id = conversation.workspace_id
     and actor.account_type = 'staff'
     and actor.is_active
    where conversation.id = conversation_id_input
      and conversation.conversation_type = 'staff_group'
      and (
        private.has_permission('chat.manage', conversation.workspace_id)
        or (
          private.has_permission('chat.internal.read', conversation.workspace_id)
          and (
            not exists (
              select 1 from public.chat_conversation_participants participant
              where participant.conversation_id = conversation.id
            )
            or exists (
              select 1 from public.chat_conversation_participants participant
              where participant.conversation_id = conversation.id
                and participant.profile_id = (select auth.uid())
            )
          )
        )
      )
  );
$$;
revoke all on function private.chat_can_access_group(uuid) from public, anon;
grant execute on function private.chat_can_access_group(uuid) to authenticated;

-- Keep direct-chat creation permission-scoped even when callers bypass the UI.
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
    and profile.account_type = 'staff'
    and private.is_active_staff_profile(profile.id)
    and (private.telegram_user_has_permission(profile.id, 'chat.manage', workspace_id_value)
      or private.telegram_user_has_permission(profile.id, 'chat.internal.read', workspace_id_value));

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
    and (private.telegram_user_has_permission(profile.id, 'chat.manage', workspace_id_value)
      or private.telegram_user_has_permission(profile.id, 'chat.internal.read', workspace_id_value))
  order by 2;
end;
$$;
revoke all on function public.list_chat_staff_roster() from public, anon;
grant execute on function public.list_chat_staff_roster() to authenticated;

create or replace function public.start_internal_group_chat(
  topic_input text,
  message_input text,
  recipient_profile_ids_input uuid[]
)
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
  requested_count integer;
  eligible_count integer;
begin
  select profile.workspace_id, coalesce(nullif(trim(profile.full_name), ''), auth_user.email)
  into workspace_id_value, display_name
  from public.profiles profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.id = actor_id and profile.is_active and profile.account_type = 'staff';

  if actor_id is null or workspace_id_value is null
     or not (private.has_permission('chat.manage', workspace_id_value)
       or private.has_permission('chat.internal.read', workspace_id_value)) then
    raise exception 'Not authorized to create a staff group.' using errcode = '42501';
  end if;

  if length(body_value) > 10000 or length(coalesce(topic_input, '')) > 180
     or cardinality(coalesce(recipient_profile_ids_input, array[]::uuid[])) > 50 then
    raise exception 'The staff group details exceed the allowed size.' using errcode = '22023';
  end if;

  select count(distinct recipient_id)::integer
    into requested_count
  from unnest(coalesce(recipient_profile_ids_input, array[]::uuid[])) as recipients(recipient_id)
  where recipient_id is distinct from actor_id;

  select count(distinct profile.id)::integer
    into eligible_count
  from unnest(coalesce(recipient_profile_ids_input, array[]::uuid[])) as recipients(recipient_id)
  join public.profiles profile on profile.id = recipients.recipient_id
  where profile.id is distinct from actor_id
    and profile.workspace_id = workspace_id_value
    and profile.is_active
    and profile.account_type = 'staff'
    and private.is_active_staff_profile(profile.id)
    and (private.telegram_user_has_permission(profile.id, 'chat.manage', workspace_id_value)
      or private.telegram_user_has_permission(profile.id, 'chat.internal.read', workspace_id_value));

  if requested_count < 1 or requested_count <> eligible_count then
    raise exception 'Select at least one active colleague who has internal chat access.' using errcode = '42501';
  end if;

  reference_value := 'INT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.chat_conversations (
    workspace_id, reference, guest_name, topic, status, priority, conversation_type
  ) values (
    workspace_id_value, reference_value, 'Internal · ' || coalesce(display_name, 'Staff group'),
    nullif(trim(topic_input), ''), 'open', 'medium', 'staff_group'
  ) returning id into conversation_id_value;

  insert into public.chat_conversation_participants(conversation_id, profile_id, added_by)
  select conversation_id_value, participant_id, actor_id
  from (
    select actor_id as participant_id
    union
    select recipient_id
    from unnest(coalesce(recipient_profile_ids_input, array[]::uuid[])) as recipients(recipient_id)
    where recipient_id is distinct from actor_id
  ) participants;

  if body_value <> '' then
    insert into public.chat_messages (conversation_id, sender_profile_id, sender_kind, body, is_internal)
    values (conversation_id_value, actor_id, 'agent', body_value, true);
  end if;

  return query select conversation_id_value, reference_value;
end;
$$;
revoke all on function public.start_internal_group_chat(text, text, uuid[]) from public, anon;
grant execute on function public.start_internal_group_chat(text, text, uuid[]) to authenticated;

drop policy if exists "chat agents read conversations" on public.chat_conversations;
create policy "chat agents read conversations"
  on public.chat_conversations for select to authenticated
  using (
    (conversation_type = 'customer_support'
      and private.has_permission('chat.manage', workspace_id))
    or (conversation_type = 'staff_group'
      and private.chat_can_access_group(id))
    or (conversation_type = 'telegram_group'
      and (private.has_permission('chat.manage', workspace_id)
        or private.has_permission('chat.internal.read', workspace_id))
      and private.is_active_staff_profile((select auth.uid())))
    or (conversation_type = 'staff_direct'
      and (private.has_permission('chat.manage', workspace_id)
        or private.has_permission('chat.internal.read', workspace_id))
      and private.chat_is_conversation_participant(id, (select auth.uid())))
  );

drop policy if exists "chat agents read messages" on public.chat_messages;
create policy "chat agents read messages"
  on public.chat_messages for select to authenticated
  using (
    exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = chat_messages.conversation_id
        and (
          (conversation.conversation_type = 'customer_support'
            and private.has_permission('chat.manage', conversation.workspace_id))
          or (conversation.conversation_type = 'staff_group'
            and private.chat_can_access_group(conversation.id))
          or (conversation.conversation_type = 'telegram_group'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.is_active_staff_profile((select auth.uid())))
          or (conversation.conversation_type = 'staff_direct'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
        )
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
          (conversation.conversation_type = 'customer_support'
            and private.has_permission('chat.manage', conversation.workspace_id))
          or (conversation.conversation_type = 'staff_group'
            and private.chat_can_access_group(conversation.id))
          or (conversation.conversation_type = 'telegram_group'
            and private.has_permission('chat.manage', conversation.workspace_id))
          or (conversation.conversation_type = 'staff_direct'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
        )
    )
  );

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
          (conversation.conversation_type = 'customer_support'
            and private.has_permission('chat.manage', conversation.workspace_id))
          or (conversation.conversation_type = 'staff_group'
            and private.chat_can_access_group(conversation.id))
          or (conversation.conversation_type = 'telegram_group'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.is_active_staff_profile((select auth.uid())))
          or (conversation.conversation_type = 'staff_direct'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
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
          (conversation.conversation_type = 'customer_support'
            and private.has_permission('chat.manage', conversation.workspace_id))
          or (conversation.conversation_type = 'staff_group'
            and private.chat_can_access_group(conversation.id))
          or (conversation.conversation_type = 'telegram_group'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.is_active_staff_profile((select auth.uid())))
          or (conversation.conversation_type = 'staff_direct'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
          or (conversation.deleted_at is null
            and conversation.customer_id is not null
            and private.customer_portal_has_access(conversation.customer_id)
            and (conversation.support_ticket_id is null
              or private.has_permission('customer.support.read', conversation.workspace_id)))
        )
    )
  );

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
              (private.has_permission('chat.manage', conversation.workspace_id)
                and (conversation.conversation_type <> 'staff_direct'
                  or private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
                and (conversation.conversation_type <> 'staff_group'
                  or private.chat_can_access_group(conversation.id)))
              or (private.has_permission('chat.internal.read', conversation.workspace_id)
                and private.is_active_staff_profile((select auth.uid()))
                and ((conversation.conversation_type = 'staff_group'
                    and private.chat_can_access_group(conversation.id))
                  or (conversation.conversation_type = 'staff_direct'
                    and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))))
            ))
          or (p_message.sender_kind = 'customer'
            and conversation.customer_id is not null
            and private.customer_portal_has_access(conversation.customer_id))
        )
    );
$$;
revoke all on function private.chat_message_actor_can_change(public.chat_messages) from public, anon;
grant execute on function private.chat_message_actor_can_change(public.chat_messages) to authenticated;

create or replace function private.chat_unarchive_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_conversations
  set archived_at = null,
      archived_by = null,
      updated_at = now()
  where id = new.conversation_id
    and deleted_at is null;
  return new;
end;
$$;
revoke all on function private.chat_unarchive_on_message() from public, anon, authenticated;

create or replace function private.telegram_notify_public_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation public.chat_conversations%rowtype;
  recipient uuid;
  notification_title text;
  notification_body text;
begin
  if new.sender_kind not in ('customer', 'agent') then return new; end if;
  select * into conversation from public.chat_conversations c where c.id = new.conversation_id;
  if conversation.id is null then return new; end if;

  if conversation.customer_id is null then
    if not new.is_internal or conversation.support_ticket_id is not null then return new; end if;
    notification_title := 'New internal staff message';
    notification_body := 'A staff conversation has a new reply.';
    for recipient in
      select distinct profile.id
      from public.profiles profile
      where profile.is_active
        and profile.account_type = 'staff'
        and profile.workspace_id = conversation.workspace_id
        and profile.id is distinct from new.sender_profile_id
        and (private.telegram_user_has_permission(profile.id, 'chat.manage', conversation.workspace_id)
          or private.telegram_user_has_permission(profile.id, 'chat.internal.read', conversation.workspace_id))
        and (
          (conversation.conversation_type = 'staff_direct'
            and exists (
              select 1 from public.chat_conversation_participants participant
              where participant.conversation_id = conversation.id and participant.profile_id = profile.id
            ))
          or (conversation.conversation_type = 'staff_group'
            and (
              exists (
                select 1 from public.chat_conversation_participants participant
                where participant.conversation_id = conversation.id and participant.profile_id = profile.id
              )
              or (private.telegram_user_has_permission(profile.id, 'chat.manage', conversation.workspace_id)
                and not exists (
                  select 1 from public.chat_conversation_participants participant
                  where participant.conversation_id = conversation.id
                ))
              or (not exists (
                  select 1 from public.chat_conversation_participants participant
                  where participant.conversation_id = conversation.id
                ) and private.telegram_user_has_permission(profile.id, 'chat.internal.read', conversation.workspace_id))
            ))
        )
    loop
      if coalesce((select preference.in_app from public.support_notification_preferences preference where preference.profile_id = recipient), true) then
        insert into public.notifications(recipient_id, type, title, body, entity_type, entity_id)
        values (recipient, 'CHAT_INTERNAL_MESSAGE', notification_title, notification_body, 'chat_conversation', conversation.id);
      end if;
      if exists (
        select 1 from public.support_notification_preferences preference
        join public.telegram_connections connection on connection.profile_id = preference.profile_id
        where preference.profile_id = recipient and preference.telegram
      ) then
        insert into public.support_notification_outbox(workspace_id, profile_id, event_type, channel, payload)
        values (conversation.workspace_id, recipient, 'CHAT_INTERNAL_MESSAGE', 'telegram', jsonb_build_object('conversation_id', conversation.id, 'reference', conversation.reference));
      end if;
    end loop;
    return new;
  end if;

  if new.is_internal or conversation.support_ticket_id is not null then return new; end if;
  if new.sender_kind = 'customer' then
    notification_title := 'New customer chat message';
    notification_body := coalesce(nullif(conversation.topic, ''), conversation.reference) || ' has a new customer message.';
    for recipient in
      select distinct candidate.profile_id
      from (
        select employee.profile_id
        from public.employees employee
        where employee.id = conversation.assigned_to
          and employee.profile_id is not null
        union all
        select profile.id
        from public.profiles profile
        where profile.is_active
          and profile.account_type = 'staff'
          and private.telegram_user_has_permission(profile.id, 'chat.manage', conversation.workspace_id)
      ) candidate
      where candidate.profile_id is not null and candidate.profile_id is distinct from new.sender_profile_id
    loop
      if coalesce((select preference.in_app from public.support_notification_preferences preference where preference.profile_id = recipient), true) then
        insert into public.notifications(recipient_id, type, title, body, entity_type, entity_id)
        values (recipient, 'CHAT_CUSTOMER_MESSAGE', notification_title, notification_body, 'chat_conversation', conversation.id);
      end if;
      if exists (
        select 1 from public.support_notification_preferences preference
        join public.telegram_connections connection on connection.profile_id = preference.profile_id
        where preference.profile_id = recipient and preference.telegram
      ) then
        insert into public.support_notification_outbox(workspace_id, profile_id, event_type, channel, payload)
        values (conversation.workspace_id, recipient, 'CHAT_CUSTOMER_MESSAGE', 'telegram', jsonb_build_object('conversation_id', conversation.id, 'reference', conversation.reference));
      end if;
    end loop;
  else
    notification_title := 'New reply from Betanor';
    notification_body := coalesce(nullif(conversation.topic, ''), conversation.reference) || ' has a new reply.';
    for recipient in
      select access.profile_id
      from public.customer_portal_access access
      join public.profiles profile on profile.id = access.profile_id and profile.is_active and profile.account_type = 'customer'
      where access.customer_id = conversation.customer_id
        and access.workspace_id = conversation.workspace_id
        and access.is_active
        and access.profile_id is distinct from new.sender_profile_id
    loop
      if coalesce((select preference.in_app from public.support_notification_preferences preference where preference.profile_id = recipient), true) then
        insert into public.notifications(recipient_id, type, title, body, entity_type, entity_id)
        values (recipient, 'CHAT_BETANOR_REPLY', notification_title, notification_body, 'chat_conversation', conversation.id);
      end if;
      if exists (
        select 1 from public.support_notification_preferences preference
        join public.telegram_connections connection on connection.profile_id = preference.profile_id
        where preference.profile_id = recipient and preference.telegram
      ) then
        insert into public.support_notification_outbox(workspace_id, profile_id, event_type, channel, payload)
        values (conversation.workspace_id, recipient, 'CHAT_BETANOR_REPLY', 'telegram', jsonb_build_object('conversation_id', conversation.id, 'reference', conversation.reference));
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.telegram_notify_public_chat_message() from public, anon, authenticated;
