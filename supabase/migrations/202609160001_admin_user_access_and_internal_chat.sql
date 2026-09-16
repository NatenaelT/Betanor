-- Account provisioning, role separation, per-user permission overrides, and internal chat.
alter table public.profiles
  add column if not exists account_type text not null default 'staff';

alter table public.profiles
  drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check check (account_type in ('staff', 'customer'));

alter table public.roles
  add column if not exists role_type text not null default 'staff';

alter table public.roles
  drop constraint if exists roles_role_type_check;
alter table public.roles
  add constraint roles_role_type_check check (role_type in ('staff', 'customer'));

update public.profiles p
set account_type = 'customer', updated_at = now()
where exists (
  select 1 from public.customer_portal_access a
  where a.profile_id = p.id and a.is_active = true
);

create table if not exists public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  is_allowed boolean not null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, permission_id)
);

create index if not exists user_permissions_permission_idx
  on public.user_permissions(permission_id, is_allowed);

alter table public.user_permissions enable row level security;
revoke all on public.user_permissions from anon, authenticated;

drop policy if exists "admins manage user permission overrides" on public.user_permissions;
create policy "admins manage user permission overrides"
  on public.user_permissions for all to authenticated
  using (
    exists (
      select 1
      from public.profiles target
      where target.id = user_permissions.user_id
        and private.has_permission('users.manage', target.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.profiles target
      where target.id = user_permissions.user_id
        and private.has_permission('users.manage', target.workspace_id)
    )
  );

grant select, insert, update, delete on public.user_permissions to authenticated;

create or replace function private.has_permission(
  requested_permission text,
  target_workspace_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.is_active = true
  )
  and coalesce(
    (
      select override.is_allowed
      from public.user_permissions override
      join public.permissions permission on permission.id = override.permission_id
      where override.user_id = (select auth.uid())
        and permission.code = requested_permission
      limit 1
    ),
    exists (
      select 1
      from public.user_roles as user_role
      join public.roles as role on role.id = user_role.role_id
      join public.role_permissions as role_permission on role_permission.role_id = role.id
      join public.permissions as permission on permission.id = role_permission.permission_id
      where user_role.user_id = (select auth.uid())
        and permission.code = requested_permission
        and (role.workspace_id is null or role.workspace_id = target_workspace_id)
        and role.role_type = 'staff'
    )
  );
$$;

revoke all on function private.has_permission(text, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_permission(text, uuid) to authenticated;

insert into public.roles (workspace_id, code, name, description, is_system, role_type)
values
  (null, 'CUSTOMER_ADMIN', 'Customer administrator', 'Customer account administrator with portal access', true, 'customer'),
  (null, 'CUSTOMER_USER', 'Customer user', 'Customer portal user', true, 'customer')
on conflict (workspace_id, code) do update
set name = excluded.name,
    description = excluded.description,
    is_system = excluded.is_system,
    role_type = excluded.role_type;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'portal.read'
where role.workspace_id is null
  and role.code in ('CUSTOMER_ADMIN', 'CUSTOMER_USER')
on conflict do nothing;

create or replace function private.sync_customer_profile_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set account_type = 'customer', updated_at = now()
  where id = new.profile_id;
  return new;
end;
$$;

revoke all on function private.sync_customer_profile_type() from public, anon, authenticated;
drop trigger if exists customer_access_sync_profile_type on public.customer_portal_access;
create trigger customer_access_sync_profile_type
  after insert or update of profile_id, is_active on public.customer_portal_access
  for each row execute procedure private.sync_customer_profile_type();

create or replace function public.start_internal_chat(
  topic_input text,
  message_input text
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
begin
  select p.workspace_id, coalesce(nullif(trim(p.full_name), ''), u.email)
  into workspace_id_value, display_name
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = actor_id and p.is_active = true;

  if workspace_id_value is null then
    select id into workspace_id_value from public.workspaces order by created_at limit 1;
  end if;

  if actor_id is null or workspace_id_value is null
     or not private.has_permission('chat.manage', workspace_id_value) then
    raise exception 'Not authorized to start an internal chat.' using errcode = '42501';
  end if;

  reference_value := 'INT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.chat_conversations (
    workspace_id, reference, guest_name, topic, status, priority
  )
  values (
    workspace_id_value, reference_value, 'Internal · ' || coalesce(display_name, 'Staff'),
    nullif(trim(topic_input), ''), 'open', 'medium'
  )
  returning id into conversation_id_value;

  insert into public.chat_messages (
    conversation_id, sender_profile_id, sender_kind, body, is_internal
  )
  values (
    conversation_id_value, actor_id, 'agent', trim(message_input), true
  );

  return query select conversation_id_value, reference_value;
end;
$$;

revoke all on function public.start_internal_chat(text, text) from public, anon;
grant execute on function public.start_internal_chat(text, text) to authenticated;

comment on table public.user_permissions is
  'Explicit per-user permission overrides. A row wins over role-derived access; false revokes the capability.';
comment on column public.profiles.account_type is
  'Control-plane classification: staff accounts may enter the workspace; customer accounts are limited to customer portal access.';
comment on column public.roles.role_type is
  'Whether a role is assignable to a staff or customer account.';
