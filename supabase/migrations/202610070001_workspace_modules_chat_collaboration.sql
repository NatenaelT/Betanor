-- Role-scoped staff presence and collaboration affordances in internal chat.
-- The authenticated user's workspace and RBAC remain authoritative; the client
-- never supplies another user's workspace or a permission decision.

alter table public.chat_messages
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create table if not exists public.chat_message_pins (
  message_id uuid primary key references public.chat_messages(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id) on delete restrict,
  pinned_at timestamptz not null default now()
);

create index if not exists chat_message_pins_conversation_idx
  on public.chat_message_pins(conversation_id, pinned_at desc);

alter table public.chat_message_pins enable row level security;
revoke all on public.chat_message_pins from anon, authenticated;
grant select, insert, delete on public.chat_message_pins to authenticated;

drop policy if exists "chat staff read pinned activities" on public.chat_message_pins;
create policy "chat staff read pinned activities"
  on public.chat_message_pins for select to authenticated
  using (
    exists (
      select 1
      from public.chat_conversations conversation
      where conversation.id = chat_message_pins.conversation_id
        and private.has_permission('chat.manage', conversation.workspace_id)
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
    )
  );

drop policy if exists "chat staff unpin activities" on public.chat_message_pins;
create policy "chat staff unpin activities"
  on public.chat_message_pins for delete to authenticated
  using (
    exists (
      select 1
      from public.chat_conversations conversation
      where conversation.id = chat_message_pins.conversation_id
        and private.has_permission('chat.manage', conversation.workspace_id)
    )
  );

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
     or not private.has_permission('chat.manage', workspace_id_value) then
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
  order by 2;
end;
$$;

revoke all on function public.list_chat_staff_roster() from public, anon;
grant execute on function public.list_chat_staff_roster() to authenticated;

-- Presence is represented by an RLS-protected heartbeat table rather than a
-- Realtime Presence channel. This preserves the existing project-wide
-- Realtime configuration while keeping roster visibility staff/workspace
-- scoped. Clients can read, but only the authenticated heartbeat RPC writes.
create table if not exists public.chat_staff_presence (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists chat_staff_presence_workspace_seen_idx
  on public.chat_staff_presence(workspace_id, last_seen_at desc);

alter table public.chat_staff_presence enable row level security;
revoke all on public.chat_staff_presence from anon, authenticated;
grant select on public.chat_staff_presence to authenticated;

drop policy if exists "chat staff read workspace presence" on public.chat_staff_presence;
create policy "chat staff read workspace presence"
  on public.chat_staff_presence for select to authenticated
  using (
    (select private.has_permission('chat.manage', workspace_id))
    and exists (
      select 1
      from public.profiles actor
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
  where profile.id = actor_id
    and profile.is_active = true
    and profile.workspace_id is not null;

  if actor_id is null
     or actor_workspace_id is null
     or not private.is_active_staff_profile(actor_id)
     or not private.has_permission('chat.manage', actor_workspace_id) then
    raise exception 'Not authorized to update staff presence.' using errcode = '42501';
  end if;

  insert into public.chat_staff_presence(profile_id, workspace_id, last_seen_at)
  values (actor_id, actor_workspace_id, now())
  on conflict (profile_id) do update
    set workspace_id = excluded.workspace_id,
        last_seen_at = now();
end;
$$;

revoke all on function public.heartbeat_chat_staff_presence() from public, anon;
grant execute on function public.heartbeat_chat_staff_presence() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'chat_staff_presence'
     ) then
    alter publication supabase_realtime add table public.chat_staff_presence;
  end if;
end;
$$;

comment on table public.chat_staff_presence is
  'Short-lived staff online heartbeat, readable only by active chat managers in the same workspace.';

comment on table public.chat_message_pins is
  'Staff-visible pinned messages/activities. Access is limited by chat.manage on the owning conversation workspace.';
