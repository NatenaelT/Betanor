-- Message changes are only available through the two authenticated RPCs below.
-- Retain a private revision trail, but never expose deleted content to chat readers.
alter table public.chat_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

create table if not exists public.chat_message_revisions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('edit', 'delete')),
  previous_body text not null,
  changed_at timestamptz not null default now()
);
create index if not exists chat_message_revisions_message_idx on public.chat_message_revisions(message_id, changed_at desc);
alter table public.chat_message_revisions enable row level security;
revoke all on public.chat_message_revisions from public, anon, authenticated;
revoke update, delete on public.chat_messages from public, anon, authenticated;

create or replace function private.chat_message_actor_can_change(p_message public.chat_messages)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_message.sender_profile_id = (select auth.uid())
    and p_message.sender_kind in ('agent', 'customer')
    and p_message.deleted_at is null
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active)
    and exists (
      select 1 from public.chat_conversations c
      where c.id = p_message.conversation_id
        and (
          (p_message.sender_kind = 'agent' and (select private.has_permission('chat.manage', c.workspace_id)))
          or (p_message.sender_kind = 'customer' and c.customer_id is not null
              and (select private.customer_portal_has_access(c.customer_id)))
        )
    );
$$;
revoke all on function private.chat_message_actor_can_change(public.chat_messages) from public, anon, authenticated;

create or replace function public.chat_edit_message(message_id_input uuid, body_input text)
returns void language plpgsql security definer set search_path = '' as $$
declare original public.chat_messages%rowtype;
begin
  if length(trim(coalesce(body_input, ''))) < 1 or length(body_input) > 10000 then
    raise exception 'Message must be between 1 and 10000 characters.' using errcode = '22023';
  end if;
  select * into original from public.chat_messages where id = message_id_input for update;
  if original.id is null or not private.chat_message_actor_can_change(original) then
    raise exception 'You cannot edit this message.' using errcode = '42501';
  end if;
  if original.body = trim(body_input) then return; end if;
  insert into public.chat_message_revisions(message_id, actor_id, action, previous_body)
  values (original.id, (select auth.uid()), 'edit', original.body);
  update public.chat_messages set body = trim(body_input), edited_at = now() where id = original.id;
end;
$$;

create or replace function public.chat_delete_message(message_id_input uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare original public.chat_messages%rowtype;
begin
  select * into original from public.chat_messages where id = message_id_input for update;
  if original.id is null or not private.chat_message_actor_can_change(original) then
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
revoke all on function public.chat_edit_message(uuid, text), public.chat_delete_message(uuid) from public, anon;
grant execute on function public.chat_edit_message(uuid, text), public.chat_delete_message(uuid) to authenticated;

-- The existing three channel switches remain master controls. Event switches
-- allow each user to mute a class of notifications without changing other users.
alter table public.support_notification_preferences
  add column if not exists event_settings jsonb not null default '{}'::jsonb;
alter table public.support_notification_preferences
  add constraint support_notification_event_settings_object check (jsonb_typeof(event_settings) = 'object');

create or replace function private.notification_event_category(p_event text)
returns text language sql immutable set search_path = '' as $$
  select case
    when upper(p_event) like 'CHAT_%' then 'chat'
    when upper(p_event) like 'SUPPORT_%' then 'support'
    when upper(p_event) like 'TASK_%' or upper(p_event) like 'PROJECT_%' then 'work'
    when upper(p_event) like 'TENDER_%' then 'tenders'
    when upper(p_event) like 'LETTER_%' or upper(p_event) like 'DOCUMENT_%' then 'documents'
    when upper(p_event) like 'PAYROLL_%' or upper(p_event) like 'FINANCE_%' then 'finance'
    else 'general'
  end;
$$;

create or replace function private.notification_event_allowed(p_profile uuid, p_event text, p_channel text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select (p.event_settings -> private.notification_event_category(p_event) ->> p_channel)::boolean
     from public.support_notification_preferences p where p.profile_id = p_profile),
    true
  );
$$;
revoke all on function private.notification_event_allowed(uuid, text, text) from public, anon, authenticated;

create or replace function private.filter_notification_by_user_preference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.notification_event_allowed(new.recipient_id, new.type, 'in_app') then return null; end if;
  return new;
end;
$$;
drop trigger if exists notification_user_event_preference on public.notifications;
create trigger notification_user_event_preference before insert on public.notifications
for each row execute function private.filter_notification_by_user_preference();

create or replace function private.filter_outbox_by_user_preference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.profile_id is not null and not private.notification_event_allowed(new.profile_id, new.event_type, new.channel) then return null; end if;
  return new;
end;
$$;
drop trigger if exists outbox_user_event_preference on public.support_notification_outbox;
create trigger outbox_user_event_preference before insert on public.support_notification_outbox
for each row execute function private.filter_outbox_by_user_preference();
