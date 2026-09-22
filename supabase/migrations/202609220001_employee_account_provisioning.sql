-- Phase A: employee access provisioning.
-- HR data and authenticated access remain separate records. The access row is
-- the auditable link between an employee, their profile, and Auth lifecycle.

alter table public.profiles
  add column if not exists password_change_required boolean not null default false;

create table if not exists public.employee_access (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  access_status text not null default 'pending_activation',
  provisioning_method text not null default 'invite',
  must_change_password boolean not null default false,
  invited_at timestamptz,
  activated_at timestamptz,
  last_invitation_at timestamptz,
  suspended_at timestamptz,
  disabled_at timestamptz,
  employment_ended_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_access_status_check check (access_status in ('pending_activation', 'active', 'suspended', 'disabled', 'employment_ended')),
  constraint employee_access_method_check check (provisioning_method in ('invite', 'temporary_password'))
);

create index if not exists employee_access_workspace_status_idx
  on public.employee_access(workspace_id, access_status);
create index if not exists employee_access_profile_idx
  on public.employee_access(profile_id);

alter table public.employee_access enable row level security;

-- PostgREST roles inherit the database's default table grants. Keep this
-- lifecycle table read-only to authenticated clients; writes are performed
-- by the server-side provisioning function with the service role.
revoke references, trigger, truncate on table public.employee_access from anon, authenticated;

grant select on public.employee_access to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'employee_access' and policyname = 'employees read their own access') then
    create policy "employees read their own access"
      on public.employee_access for select to authenticated
      using (
        profile_id = (select auth.uid())
        or exists (
          select 1 from public.employees employee
          where employee.id = employee_access.employee_id
            and (
              (select private.has_permission('hr.read', employee_access.workspace_id))
              or (select private.has_permission('hr.manage', employee_access.workspace_id))
              or (select private.has_permission('users.manage', employee_access.workspace_id))
            )
        )
      );
  end if;
end
$$;

-- Password-change completion is the only additional self-service profile field.
grant update (password_change_required) on public.profiles to authenticated;

comment on table public.employee_access is
  'Separate access-control lifecycle for an employee. Credentials remain in Supabase Auth; this table stores no password.';
comment on column public.profiles.password_change_required is
  'Set only by the provisioning workflow for temporary-password accounts; cleared after the employee changes their password.';
