-- Telegram connects to existing Betanor identities, support preferences,
-- customer conversations, and the support notification outbox. It does not
-- create a parallel chat or customer model.

create extension if not exists pg_net with schema extensions;

create table public.telegram_connections (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  telegram_user_id text not null unique check (telegram_user_id ~ '^[0-9]{1,32}$'),
  telegram_chat_id text not null unique check (telegram_chat_id ~ '^-?[0-9]{1,32}$'),
  telegram_username text,
  active_conversation_id uuid references public.chat_conversations(id) on delete set null,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.telegram_link_challenges (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.telegram_processed_updates (
  update_id bigint primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid references public.chat_messages(id) on delete set null,
  processed_at timestamptz not null default now()
);

alter table public.telegram_connections enable row level security;
alter table public.telegram_link_challenges enable row level security;
alter table public.telegram_processed_updates enable row level security;
revoke all on public.telegram_connections, public.telegram_link_challenges, public.telegram_processed_updates from anon, authenticated;
grant select, delete on public.telegram_connections to authenticated;

create policy telegram_connection_read_self on public.telegram_connections
  for select to authenticated using (profile_id = (select auth.uid()));
create policy telegram_connection_delete_self on public.telegram_connections
  for delete to authenticated using (profile_id = (select auth.uid()));

create or replace function private.telegram_disable_preference_on_unlink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_notification_preferences
  set telegram = false
  where profile_id = old.profile_id;
  return old;
end;
$$;
revoke all on function private.telegram_disable_preference_on_unlink() from public, anon, authenticated;
create trigger telegram_disable_preference_after_delete
  after delete on public.telegram_connections
  for each row execute function private.telegram_disable_preference_on_unlink();

alter table public.support_notification_outbox
  add column if not exists attempts integer not null default 0 check (attempts >= 0),
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists claimed_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists last_error text;

create index if not exists support_telegram_outbox_delivery_idx
  on public.support_notification_outbox(available_at, created_at)
  where channel = 'telegram' and status = 'queued';

-- The transport secret is generated and held only in Supabase Vault. It is
-- shared by Telegram's webhook header and private Postgres-to-Edge dispatches.
do $$
declare secret_value text;
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'betanor_telegram_transport_secret'
  ) then
    secret_value := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      secret_value,
      'betanor_telegram_transport_secret',
      'Private Telegram webhook and notification-dispatch transport authentication.'
    );
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'betanor_supabase_url'
  ) then
    perform vault.create_secret(
      'https://rtoiycbuqeebjddmrspa.supabase.co',
      'betanor_supabase_url',
      'Project URL used only by private asynchronous notification dispatch.'
    );
  end if;
end;
$$;

create or replace function public.telegram_create_link_challenge()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  token_value text;
begin
  if actor is null or not exists (
    select 1 from public.profiles p where p.id = actor and p.is_active
  ) then
    raise exception 'An active Betanor account is required.' using errcode = '42501';
  end if;
  if exists (select 1 from public.telegram_connections c where c.profile_id = actor) then
    raise exception 'Disconnect the existing Telegram account before linking a different one.' using errcode = '23505';
  end if;

  delete from public.telegram_link_challenges
  where expires_at < now() - interval '1 day';

  token_value := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.telegram_link_challenges(profile_id, token_hash, expires_at, consumed_at, created_at)
  values (actor, encode(extensions.digest(token_value, 'sha256'), 'hex'), now() + interval '10 minutes', null, now())
  on conflict (profile_id) do update
    set token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        consumed_at = null,
        created_at = excluded.created_at;
  return token_value;
end;
$$;
revoke all on function public.telegram_create_link_challenge() from public, anon;
grant execute on function public.telegram_create_link_challenge() to authenticated;

create or replace function public.telegram_user_can_configure()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and private.has_permission('settings.manage', p.workspace_id)
  );
$$;
revoke all on function public.telegram_user_can_configure() from public, anon;
grant execute on function public.telegram_user_can_configure() to authenticated;

create or replace function public.telegram_get_transport_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'betanor_telegram_transport_secret'
  limit 1;
$$;
revoke all on function public.telegram_get_transport_secret() from public, anon, authenticated;
grant execute on function public.telegram_get_transport_secret() to service_role;

create or replace function public.telegram_get_project_url()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'betanor_supabase_url'
  limit 1;
$$;
revoke all on function public.telegram_get_project_url() from public, anon, authenticated;
grant execute on function public.telegram_get_project_url() to service_role;

create or replace function public.telegram_transport_secret_matches(secret_input text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    extensions.digest(secret_input, 'sha256') = extensions.digest(decrypted_secret, 'sha256'),
    false
  )
  from vault.decrypted_secrets
  where name = 'betanor_telegram_transport_secret'
  limit 1;
$$;
revoke all on function public.telegram_transport_secret_matches(text) from public, anon, authenticated;
grant execute on function public.telegram_transport_secret_matches(text) to service_role;

create or replace function public.telegram_consume_link_challenge(
  token_input text,
  telegram_user_id_input text,
  telegram_chat_id_input text,
  telegram_username_input text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge public.telegram_link_challenges%rowtype;
  existing_profile uuid;
begin
  if coalesce(length(token_input), 0) <> 64
     or telegram_user_id_input !~ '^[0-9]{1,32}$'
     or telegram_chat_id_input !~ '^-?[0-9]{1,32}$' then
    raise exception 'Invalid Telegram link details.' using errcode = '22023';
  end if;

  select * into challenge
  from public.telegram_link_challenges c
  where c.token_hash = encode(extensions.digest(token_input, 'sha256'), 'hex')
  for update;

  if challenge.profile_id is null then
    raise exception 'This connection link is invalid or has expired. Create a new one from your Betanor profile.' using errcode = '22023';
  end if;

  if challenge.consumed_at is not null then
    select c.profile_id into existing_profile
    from public.telegram_connections c
    where c.profile_id = challenge.profile_id
      and c.telegram_user_id = telegram_user_id_input;
    if existing_profile is not null then
      return existing_profile;
    end if;
    raise exception 'This connection link has already been used.' using errcode = '23505';
  end if;

  if challenge.expires_at <= now() then
    raise exception 'This connection link has expired. Create a new one from your Betanor profile.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = challenge.profile_id and p.is_active
  ) then
    raise exception 'This Betanor account is inactive.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.telegram_connections c
    where c.telegram_user_id = telegram_user_id_input
      and c.profile_id <> challenge.profile_id
  ) or exists (
    select 1 from public.telegram_connections c
    where c.profile_id = challenge.profile_id
      and c.telegram_user_id <> telegram_user_id_input
  ) then
    raise exception 'This Telegram account or Betanor profile is already linked. Disconnect the existing link first.' using errcode = '23505';
  end if;

  insert into public.telegram_connections(profile_id, telegram_user_id, telegram_chat_id, telegram_username, linked_at, last_seen_at)
  values (challenge.profile_id, telegram_user_id_input, telegram_chat_id_input, nullif(left(telegram_username_input, 64), ''), now(), now())
  on conflict (profile_id) do update
    set telegram_chat_id = excluded.telegram_chat_id,
        telegram_username = excluded.telegram_username,
        last_seen_at = now()
    where public.telegram_connections.telegram_user_id = excluded.telegram_user_id;

  update public.telegram_link_challenges
  set consumed_at = now()
  where profile_id = challenge.profile_id;

  return challenge.profile_id;
end;
$$;
revoke all on function public.telegram_consume_link_challenge(text, text, text, text) from public, anon, authenticated;
grant execute on function public.telegram_consume_link_challenge(text, text, text, text) to service_role;

create or replace function private.telegram_user_has_permission(
  actor_profile_id uuid,
  requested_permission text,
  target_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles actor
    where actor.id = actor_profile_id
      and actor.is_active
      and (actor.workspace_id is null or actor.workspace_id = target_workspace_id)
  )
  and coalesce(
    (
      select override.is_allowed
      from public.user_permissions override
      join public.permissions permission on permission.id = override.permission_id
      where override.user_id = actor_profile_id
        and permission.code = requested_permission
      limit 1
    ),
    exists (
      select 1
      from public.user_roles user_role
      join public.roles role on role.id = user_role.role_id
      join public.role_permissions role_permission on role_permission.role_id = role.id
      join public.permissions permission on permission.id = role_permission.permission_id
      where user_role.user_id = actor_profile_id
        and permission.code = requested_permission
        and (role.workspace_id is null or role.workspace_id = target_workspace_id)
    ),
    false
  );
$$;
revoke all on function private.telegram_user_has_permission(uuid, text, uuid) from public, anon, authenticated;
grant execute on function private.telegram_user_has_permission(uuid, text, uuid) to service_role;

create or replace function private.telegram_can_access_conversation(actor_profile_id uuid, conversation_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_conversations conversation
    join public.profiles actor on actor.id = actor_profile_id and actor.is_active
    left join public.support_tickets ticket on ticket.id = conversation.support_ticket_id
    where conversation.id = conversation_id_input
      and conversation.status not in ('closed', 'resolved')
      and coalesce(ticket.status, '') not in ('Closed', 'Resolved', 'Cancelled')
      and (
        (
          actor.account_type = 'customer'
          and conversation.customer_id is not null
          and exists (
            select 1 from public.customer_portal_access access
            where access.profile_id = actor_profile_id
              and access.customer_id = conversation.customer_id
              and access.workspace_id = conversation.workspace_id
              and access.is_active
          )
          and (
            conversation.support_ticket_id is null
            or private.telegram_user_has_permission(actor_profile_id, 'customer.support.respond', conversation.workspace_id)
          )
        )
        or (
          actor.account_type = 'staff'
          and (
            (
              conversation.customer_id is null
              and conversation.support_ticket_id is null
              and private.telegram_user_has_permission(actor_profile_id, 'chat.manage', conversation.workspace_id)
            )
            or (
              conversation.customer_id is not null
              and (
                private.telegram_user_has_permission(actor_profile_id, 'chat.manage', conversation.workspace_id)
                or (
                  conversation.support_ticket_id is not null
                  and private.telegram_user_has_permission(actor_profile_id, 'support.view_all', conversation.workspace_id)
                )
                or (
                  conversation.support_ticket_id is not null
                  and private.telegram_user_has_permission(actor_profile_id, 'support.respond', conversation.workspace_id)
                  and exists (
                    select 1
                    from public.employees employee
                    where employee.profile_id = actor_profile_id
                      and employee.id = ticket.assigned_employee_id
                      and employee.workspace_id = conversation.workspace_id
                  )
                )
              )
            )
          )
        )
      )
  );
$$;
revoke all on function private.telegram_can_access_conversation(uuid, uuid) from public, anon, authenticated;
grant execute on function private.telegram_can_access_conversation(uuid, uuid) to service_role;

create or replace function public.telegram_list_conversations(actor_profile_id uuid)
returns table(conversation_id uuid, reference text, subject text, status text, is_support_ticket boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select conversation.id,
         coalesce(ticket.ticket_number, conversation.reference),
         coalesce(nullif(conversation.topic, ''), ticket.title, 'Customer conversation'),
         conversation.status,
         conversation.support_ticket_id is not null
  from public.chat_conversations conversation
  left join public.support_tickets ticket on ticket.id = conversation.support_ticket_id
  where private.telegram_can_access_conversation(actor_profile_id, conversation.id)
  order by conversation.updated_at desc
  limit 10;
$$;
revoke all on function public.telegram_list_conversations(uuid) from public, anon, authenticated;
grant execute on function public.telegram_list_conversations(uuid) to service_role;

create or replace function public.telegram_select_conversation(actor_profile_id uuid, conversation_id_input uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.telegram_can_access_conversation(actor_profile_id, conversation_id_input) then
    raise exception 'This conversation is not available to your Betanor account.' using errcode = '42501';
  end if;
  update public.telegram_connections connection
  set active_conversation_id = conversation_id_input,
      last_seen_at = now()
  where connection.profile_id = actor_profile_id;
  return found;
end;
$$;
revoke all on function public.telegram_select_conversation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.telegram_select_conversation(uuid, uuid) to service_role;

create or replace function public.telegram_record_chat_message(
  actor_profile_id uuid,
  conversation_id_input uuid,
  body_input text,
  update_id_input bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_record public.profiles%rowtype;
  conversation_record public.chat_conversations%rowtype;
  existing_message uuid;
  new_message uuid;
begin
  if coalesce(length(trim(body_input)), 0) < 1 or length(body_input) > 4000 then
    raise exception 'A message must contain between 1 and 4000 characters.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.telegram_connections connection
    where connection.profile_id = actor_profile_id
      and connection.active_conversation_id = conversation_id_input
  ) or not private.telegram_can_access_conversation(actor_profile_id, conversation_id_input) then
    raise exception 'Select an active conversation that belongs to your Betanor account.' using errcode = '42501';
  end if;

  insert into public.telegram_processed_updates(update_id, profile_id)
  values (update_id_input, actor_profile_id)
  on conflict (update_id) do nothing;

  if not found then
    select processed.message_id into existing_message
    from public.telegram_processed_updates processed
    where processed.update_id = update_id_input
      and processed.profile_id = actor_profile_id;
    return existing_message;
  end if;

  select * into profile_record from public.profiles p where p.id = actor_profile_id and p.is_active;
  if profile_record.id is null then
    raise exception 'The linked Betanor account is inactive.' using errcode = '42501';
  end if;

  select * into conversation_record
  from public.chat_conversations conversation
  where conversation.id = conversation_id_input;

  insert into public.chat_messages(conversation_id, sender_profile_id, sender_kind, body, is_internal)
  values (
    conversation_id_input,
    actor_profile_id,
    case when profile_record.account_type = 'customer' then 'customer' else 'agent' end,
    trim(body_input),
    conversation_record.customer_id is null
  ) returning id into new_message;

  update public.telegram_processed_updates
  set message_id = new_message
  where update_id = update_id_input;
  update public.chat_conversations set updated_at = now() where id = conversation_id_input;
  update public.telegram_connections set last_seen_at = now() where profile_id = actor_profile_id;
  return new_message;
end;
$$;
revoke all on function public.telegram_record_chat_message(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.telegram_record_chat_message(uuid, uuid, text, bigint) to service_role;

create or replace function public.telegram_claim_notifications(batch_limit integer default 20)
returns table(outbox_id uuid, recipient_profile_id uuid, event_type text, payload jsonb, telegram_chat_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_notification_outbox item
  set status = 'skipped',
      claimed_at = null,
      last_error = 'Telegram is not linked or the recipient has disabled Telegram alerts.'
  where item.channel = 'telegram'
    and item.status = 'queued'
    and not exists (
      select 1
      from public.telegram_connections connection
      join public.support_notification_preferences preference on preference.profile_id = connection.profile_id and preference.telegram
      join public.profiles profile on profile.id = connection.profile_id and profile.is_active
      where connection.profile_id = item.profile_id
    );

  update public.support_notification_outbox item
  set status = 'queued', claimed_at = null, available_at = now()
  where item.channel = 'telegram'
    and item.status = 'processing'
    and item.claimed_at < now() - interval '5 minutes';

  return query
  with ready as (
    select item.id, connection.telegram_chat_id
    from public.support_notification_outbox item
    join public.telegram_connections connection on connection.profile_id = item.profile_id
    join public.support_notification_preferences preference on preference.profile_id = item.profile_id and preference.telegram
    join public.profiles profile on profile.id = item.profile_id and profile.is_active
    where item.channel = 'telegram'
      and item.status = 'queued'
      and item.available_at <= now()
    order by item.created_at
    for update of item skip locked
    limit least(greatest(coalesce(batch_limit, 20), 1), 100)
  )
  update public.support_notification_outbox item
  set status = 'processing', attempts = item.attempts + 1, claimed_at = now(), last_error = null
  from ready
  where item.id = ready.id
  returning item.id, item.profile_id, item.event_type, item.payload, ready.telegram_chat_id;
end;
$$;
revoke all on function public.telegram_claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.telegram_claim_notifications(integer) to service_role;

create or replace function public.telegram_finish_notification(outbox_id_input uuid, success_input boolean, error_input text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare attempt_value integer;
begin
  select item.attempts into attempt_value
  from public.support_notification_outbox item
  where item.id = outbox_id_input and item.channel = 'telegram';
  if attempt_value is null then return; end if;

  update public.support_notification_outbox item
  set status = case
        when success_input then 'sent'
        when attempt_value >= 6 then 'failed'
        else 'queued'
      end,
      sent_at = case when success_input then now() else item.sent_at end,
      claimed_at = null,
      available_at = case
        when success_input or attempt_value >= 6 then item.available_at
        else now() + make_interval(secs => least(3600, 15 * power(2::numeric, least(attempt_value, 8))::integer))
      end,
      last_error = case when success_input then null else left(coalesce(error_input, 'Telegram delivery failed.'), 500) end
  where item.id = outbox_id_input and item.channel = 'telegram';
end;
$$;
revoke all on function public.telegram_finish_notification(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.telegram_finish_notification(uuid, boolean, text) to service_role;

-- Customer-facing chats and explicitly internal staff-only chats both use
-- Telegram. Internal notes inside customer conversations remain excluded.
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
      select profile.id
      from public.profiles profile
      where profile.is_active
        and profile.account_type = 'staff'
        and profile.id is distinct from new.sender_profile_id
        and private.telegram_user_has_permission(profile.id, 'chat.manage', conversation.workspace_id)
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
create trigger telegram_public_chat_notifications
  after insert on public.chat_messages
  for each row execute function private.telegram_notify_public_chat_message();

create or replace function private.telegram_dispatch_on_outbox_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.channel <> 'telegram' then return new; end if;
  begin
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'betanor_supabase_url' limit 1) || '/functions/v1/telegram-bridge',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-betanor-transport-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'betanor_telegram_transport_secret' limit 1)
      ),
      body := jsonb_build_object('action', 'dispatch'),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'Telegram notification dispatch was not triggered; the scheduled worker will retry.';
  end;
  return new;
end;
$$;
revoke all on function private.telegram_dispatch_on_outbox_insert() from public, anon, authenticated;
create trigger telegram_outbox_async_dispatch
  after insert on public.support_notification_outbox
  for each row when (new.channel = 'telegram')
  execute function private.telegram_dispatch_on_outbox_insert();

-- Supabase Cron is the durable fallback if the immediate pg_net dispatch is
-- temporarily unavailable. Telegram delivery itself remains outside business
-- transactions and never blocks support/chat writes.
select cron.unschedule(jobid)
from cron.job
where jobname = 'betanor-telegram-notification-dispatch';

select cron.schedule(
  'betanor-telegram-notification-dispatch',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'betanor_supabase_url' limit 1) || '/functions/v1/telegram-bridge',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-betanor-transport-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'betanor_telegram_transport_secret' limit 1)
      ),
      body := jsonb_build_object('action', 'dispatch'),
      timeout_milliseconds := 5000
    );
  $$
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'betanor-telegram-update-cleanup';

select cron.schedule(
  'betanor-telegram-update-cleanup',
  '0 3 * * *',
  $$
    delete from public.telegram_processed_updates
    where processed_at < now() - interval '90 days';
  $$
);
