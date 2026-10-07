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

-- Private Realtime presence is scoped to the active staff member's own
-- workspace. Presence contains only an actor id; no email or profile fields.
drop policy if exists "betanor staff presence read own workspace" on realtime.messages;
create policy "betanor staff presence read own workspace"
  on realtime.messages for select to authenticated
  using (
    extension = 'presence'
    and exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.workspace_id is not null
        and profile.is_active = true
        and private.is_active_staff_profile(profile.id)
        and realtime.topic() = 'workspace:' || profile.workspace_id::text || ':staff-presence'
    )
  );

drop policy if exists "betanor staff presence write own workspace" on realtime.messages;
create policy "betanor staff presence write own workspace"
  on realtime.messages for insert to authenticated
  with check (
    extension = 'presence'
    and exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.workspace_id is not null
        and profile.is_active = true
        and private.is_active_staff_profile(profile.id)
        and realtime.topic() = 'workspace:' || profile.workspace_id::text || ':staff-presence'
    )
  );

comment on table public.chat_message_pins is
  'Staff-visible pinned messages/activities. Access is limited by chat.manage on the owning conversation workspace.';
