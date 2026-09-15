-- Phase 19: administration, payroll operations, and authenticated customer portal access.
-- This migration keeps destructive actions out of operational history: users and
-- content are deactivated/archived, while financial and HR records remain auditable.

insert into public.permissions (code, module, description)
values
  ('files.manage', 'administration', 'Manage workspace files and document metadata'),
  ('portal.read', 'customer_portal', 'Read the authenticated customer portal')
on conflict (code) do update set module = excluded.module, description = excluded.description;

with role_permissions_seed(role_code, permission_code) as (
  values
    ('SUPER_ADMIN', 'files.manage'), ('SUPER_ADMIN', 'portal.read'),
    ('ADMIN', 'cms.publish'), ('ADMIN', 'payroll.manage'), ('ADMIN', 'files.manage'), ('ADMIN', 'portal.read')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from role_permissions_seed
join public.roles as role on role.code = role_permissions_seed.role_code and role.workspace_id is null
join public.permissions as permission on permission.code = role_permissions_seed.permission_code
on conflict do nothing;

-- Super administrators can manage application access for identities that already
-- exist in Supabase Auth. Auth identities themselves are never deleted from the
-- browser; deactivation removes role assignments and disables the profile.
grant select, insert, update on public.profiles to authenticated;
grant insert, update, delete on public.user_roles to authenticated;
create policy "administrators create profiles" on public.profiles for insert to authenticated
  with check ((select private.has_permission('users.manage', workspace_id)));
create policy "administrators update profiles" on public.profiles for update to authenticated
  using ((select private.has_permission('users.manage', workspace_id)))
  with check ((select private.has_permission('users.manage', workspace_id)));
create policy "administrators manage role assignments" on public.user_roles for all to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.profiles target_profile where target_profile.id = user_roles.user_id and (select private.has_permission('users.manage', target_profile.workspace_id)))
  )
  with check (
    exists (select 1 from public.profiles target_profile where target_profile.id = user_roles.user_id and (select private.has_permission('users.manage', target_profile.workspace_id)))
  );

-- Workspace configuration and document metadata are administration-only.
grant update on public.workspaces to authenticated;
create policy "administrators update workspace configuration" on public.workspaces for update to authenticated
  using ((select private.has_permission('settings.manage', id)))
  with check ((select private.has_permission('settings.manage', id)));
grant insert, update, delete on public.departments, public.positions to authenticated;
create policy "administrators manage departments" on public.departments for all to authenticated
  using ((select private.has_permission('settings.manage', workspace_id)))
  with check ((select private.has_permission('settings.manage', workspace_id)));
create policy "administrators manage positions" on public.positions for all to authenticated
  using ((select private.has_permission('settings.manage', workspace_id)))
  with check ((select private.has_permission('settings.manage', workspace_id)));
grant select, insert, update, delete on public.documents to authenticated;
create policy "administrators manage documents" on public.documents for all to authenticated
  using ((select private.has_permission('files.manage', workspace_id)))
  with check ((select private.has_permission('files.manage', workspace_id)));

-- Payroll managers can generate a cycle and the associated payslip baseline.
-- Employees retain read-only access to their own slips through the existing policy.
grant select, insert, update on public.payroll_cycles, public.payslips to authenticated;
create policy "payroll managers read cycles" on public.payroll_cycles for select to authenticated
  using ((select private.has_permission('payroll.manage', workspace_id)));
create policy "payroll managers create cycles" on public.payroll_cycles for insert to authenticated
  with check ((select private.has_permission('payroll.manage', workspace_id)));
create policy "payroll managers update cycles" on public.payroll_cycles for update to authenticated
  using ((select private.has_permission('payroll.manage', workspace_id)))
  with check ((select private.has_permission('payroll.manage', workspace_id)));
create policy "payroll managers create payslips" on public.payslips for insert to authenticated
  with check (exists (select 1 from public.payroll_cycles cycle where cycle.id = payroll_cycle_id and (select private.has_permission('payroll.manage', cycle.workspace_id))));
create policy "payroll managers update payslips" on public.payslips for update to authenticated
  using ((select private.has_permission('payroll.manage', private.payslip_workspace(id))))
  with check ((select private.has_permission('payroll.manage', private.payslip_workspace(id))));
create policy "payroll managers read employment contracts" on public.employment_contracts for select to authenticated
  using (exists (select 1 from public.employees employee where employee.id = employment_contracts.employee_id and (select private.has_permission('payroll.manage', employee.workspace_id))));

-- Authenticated portal accounts are explicit customer-to-profile links. A user
-- can only see the customer records assigned to their own profile; administrators
-- can assign or revoke links from the Users screen.
create table if not exists public.customer_portal_access (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  access_level text not null default 'customer_admin' check (access_level in ('customer_viewer','customer_admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, profile_id)
);
create index if not exists customer_portal_access_profile_idx on public.customer_portal_access(profile_id, is_active);
create index if not exists customer_portal_access_customer_idx on public.customer_portal_access(customer_id, is_active);

create or replace function private.customer_portal_has_access(target_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.customer_portal_access access
    where access.customer_id = target_customer_id
      and access.profile_id = (select auth.uid())
      and access.is_active
  );
$$;
revoke all on function private.customer_portal_has_access(uuid) from public, anon;
grant execute on function private.customer_portal_has_access(uuid) to authenticated;

grant select, insert, update, delete on public.customer_portal_access to authenticated;
create policy "customers read their portal access" on public.customer_portal_access for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.has_permission('users.manage', workspace_id)));
create policy "administrators manage portal access" on public.customer_portal_access for all to authenticated
  using ((select private.has_permission('users.manage', workspace_id)))
  with check ((select private.has_permission('users.manage', workspace_id)));

create policy "customer portal reads customers" on public.customers for select to authenticated
  using ((select private.customer_portal_has_access(id)));
create policy "customer portal reads rfqs" on public.rfq_requests for select to authenticated
  using ((customer_id is not null) and (select private.customer_portal_has_access(customer_id)));
create policy "customer portal reads quotations" on public.quotations for select to authenticated
  using ((customer_id is not null) and (select private.customer_portal_has_access(customer_id)));
create policy "customer portal reads contracts" on public.contracts for select to authenticated
  using ((customer_id is not null) and (select private.customer_portal_has_access(customer_id)));
create policy "customer portal reads projects" on public.projects for select to authenticated
  using ((customer_id is not null) and (select private.customer_portal_has_access(customer_id)));
create policy "customer portal reads invoices" on public.invoices for select to authenticated
  using ((customer_id is not null) and (select private.customer_portal_has_access(customer_id)));

-- Portal customers can see project delivery updates, never internal assignments.
grant select on public.tasks to authenticated;
create policy "customer portal reads project tasks" on public.tasks for select to authenticated
  using (exists (select 1 from public.projects project where project.id = tasks.project_id and project.customer_id is not null and (select private.customer_portal_has_access(project.customer_id))));
