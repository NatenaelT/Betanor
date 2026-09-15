-- Phase 5: identity bootstrap and capability-based authorization.
-- Application roles are stored in PostgreSQL, never in user_metadata or browser state.

create schema if not exists private;
revoke all on schema private from public, anon;

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
    from public.user_roles as user_role
    join public.roles as role on role.id = user_role.role_id
    join public.role_permissions as role_permission on role_permission.role_id = role.id
    join public.permissions as permission on permission.id = role_permission.permission_id
    where user_role.user_id = (select auth.uid())
      and permission.code = requested_permission
      and (role.workspace_id is null or role.workspace_id = target_workspace_id)
  );
$$;

create or replace function private.owns_employee(target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employees as employee
    where employee.id = target_employee_id
      and employee.profile_id = (select auth.uid())
  );
$$;

create or replace function private.leave_request_workspace(target_leave_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select employee.workspace_id
  from public.leave_requests as leave_request
  join public.employees as employee on employee.id = leave_request.employee_id
  where leave_request.id = target_leave_request_id;
$$;

create or replace function private.leave_request_is_valid(
  target_employee_id uuid,
  target_leave_type_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employees as employee
    join public.leave_types as leave_type on leave_type.workspace_id = employee.workspace_id
    where employee.id = target_employee_id
      and leave_type.id = target_leave_type_id
  );
$$;

create or replace function private.payslip_is_self(target_payslip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payslips as payslip
    join public.employees as employee on employee.id = payslip.employee_id
    where payslip.id = target_payslip_id
      and employee.profile_id = (select auth.uid())
  );
$$;

create or replace function private.payslip_workspace(target_payslip_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select payroll_cycle.workspace_id
  from public.payslips as payslip
  join public.payroll_cycles as payroll_cycle on payroll_cycle.id = payslip.payroll_cycle_id
  where payslip.id = target_payslip_id;
$$;

revoke all on function private.has_permission(text, uuid) from public, anon;
revoke all on function private.owns_employee(uuid) from public, anon;
revoke all on function private.leave_request_workspace(uuid) from public, anon;
revoke all on function private.leave_request_is_valid(uuid, uuid) from public, anon;
revoke all on function private.payslip_is_self(uuid) from public, anon;
revoke all on function private.payslip_workspace(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_permission(text, uuid) to authenticated;
grant execute on function private.owns_employee(uuid) to authenticated;
grant execute on function private.leave_request_workspace(uuid) to authenticated;
grant execute on function private.leave_request_is_valid(uuid, uuid) to authenticated;
grant execute on function private.payslip_is_self(uuid) to authenticated;
grant execute on function private.payslip_workspace(uuid) to authenticated;

-- This trigger only mirrors a new identity into the application profile table.
-- Metadata is used for display name only; it has no authorization purpose.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Master-specification permission catalogue.
insert into public.permissions (code, module, description)
values
  ('cms.read', 'cms', 'Read internal CMS content'),
  ('cms.write', 'cms', 'Create or edit CMS content'),
  ('cms.publish', 'cms', 'Publish CMS content'),
  ('crm.read', 'crm', 'Read CRM records'),
  ('crm.write', 'crm', 'Create or edit CRM records'),
  ('quotation.create', 'commercial', 'Create quotations'),
  ('quotation.edit', 'commercial', 'Edit quotations'),
  ('quotation.approve', 'commercial', 'Approve quotations'),
  ('quotation.send', 'commercial', 'Send quotations'),
  ('contract.create', 'commercial', 'Create contracts'),
  ('contract.approve', 'commercial', 'Approve contracts'),
  ('task.create', 'work', 'Create tasks'),
  ('task.assign', 'work', 'Assign tasks'),
  ('task.edit', 'work', 'Edit tasks'),
  ('project.manage', 'work', 'Manage projects'),
  ('kpi.read_self', 'strategy', 'Read own KPIs'),
  ('kpi.read_team', 'strategy', 'Read team KPIs'),
  ('kpi.configure', 'strategy', 'Configure KPIs'),
  ('kpi.review', 'strategy', 'Review KPIs'),
  ('leave.request', 'hr', 'Request leave'),
  ('leave.approve', 'hr', 'Approve leave'),
  ('payroll.read_self', 'finance', 'Read own payslips'),
  ('payroll.manage', 'finance', 'Manage payroll'),
  ('recruitment.manage', 'hr', 'Manage recruitment'),
  ('finance.read', 'finance', 'Read finance records'),
  ('finance.create', 'finance', 'Create finance records'),
  ('finance.approve', 'finance', 'Approve finance records'),
  ('hr.read', 'hr', 'Read employee records'),
  ('hr.manage', 'hr', 'Manage employee records'),
  ('users.manage', 'administration', 'Manage user access'),
  ('settings.manage', 'administration', 'Manage workspace settings'),
  ('audit.read', 'administration', 'Read audit events')
on conflict (code) do update set module = excluded.module, description = excluded.description;

insert into public.roles (code, name, description, is_system)
select role_seed.code, role_seed.name, role_seed.description, true
from (values
  ('SUPER_ADMIN', 'Super administrator', 'Full platform administration'),
  ('MANAGEMENT', 'Management', 'Executive and strategic management'),
  ('ADMIN', 'Administrator', 'Workspace administration'),
  ('HR_MANAGER', 'HR manager', 'Human resources management'),
  ('HR_STAFF', 'HR staff', 'Human resources operations'),
  ('FINANCE_MANAGER', 'Finance manager', 'Finance leadership and approvals'),
  ('FINANCE_STAFF', 'Finance staff', 'Finance operations'),
  ('SALES_MANAGER', 'Sales manager', 'Sales leadership and quotation approval'),
  ('SALES_STAFF', 'Sales staff', 'Sales operations'),
  ('PROJECT_MANAGER', 'Project manager', 'Project delivery management'),
  ('TEAM_LEAD', 'Team lead', 'Team delivery coordination'),
  ('TECHNICAL_STAFF', 'Technical staff', 'Technical delivery'),
  ('SUPPORT_STAFF', 'Support staff', 'Customer support delivery'),
  ('CONTENT_EDITOR', 'Content editor', 'Content editing and publishing'),
  ('EMPLOYEE', 'Employee', 'Standard employee self-service'),
  ('VIEWER', 'Viewer', 'Read-only workspace visibility')
) as role_seed(code, name, description)
where not exists (
  select 1 from public.roles as existing_role
  where existing_role.workspace_id is null and existing_role.code = role_seed.code
);

with role_permissions_seed(role_code, permission_code) as (
  values
    ('SUPER_ADMIN', 'cms.read'), ('SUPER_ADMIN', 'cms.write'), ('SUPER_ADMIN', 'cms.publish'), ('SUPER_ADMIN', 'crm.read'), ('SUPER_ADMIN', 'crm.write'), ('SUPER_ADMIN', 'quotation.create'), ('SUPER_ADMIN', 'quotation.edit'), ('SUPER_ADMIN', 'quotation.approve'), ('SUPER_ADMIN', 'quotation.send'), ('SUPER_ADMIN', 'contract.create'), ('SUPER_ADMIN', 'contract.approve'), ('SUPER_ADMIN', 'task.create'), ('SUPER_ADMIN', 'task.assign'), ('SUPER_ADMIN', 'task.edit'), ('SUPER_ADMIN', 'project.manage'), ('SUPER_ADMIN', 'kpi.read_self'), ('SUPER_ADMIN', 'kpi.read_team'), ('SUPER_ADMIN', 'kpi.configure'), ('SUPER_ADMIN', 'kpi.review'), ('SUPER_ADMIN', 'leave.request'), ('SUPER_ADMIN', 'leave.approve'), ('SUPER_ADMIN', 'payroll.read_self'), ('SUPER_ADMIN', 'payroll.manage'), ('SUPER_ADMIN', 'recruitment.manage'), ('SUPER_ADMIN', 'finance.read'), ('SUPER_ADMIN', 'finance.create'), ('SUPER_ADMIN', 'finance.approve'), ('SUPER_ADMIN', 'hr.read'), ('SUPER_ADMIN', 'hr.manage'), ('SUPER_ADMIN', 'users.manage'), ('SUPER_ADMIN', 'settings.manage'), ('SUPER_ADMIN', 'audit.read'),
    ('MANAGEMENT', 'crm.read'), ('MANAGEMENT', 'quotation.approve'), ('MANAGEMENT', 'contract.approve'), ('MANAGEMENT', 'project.manage'), ('MANAGEMENT', 'kpi.read_self'), ('MANAGEMENT', 'kpi.read_team'), ('MANAGEMENT', 'kpi.configure'), ('MANAGEMENT', 'kpi.review'), ('MANAGEMENT', 'finance.read'), ('MANAGEMENT', 'finance.approve'), ('MANAGEMENT', 'audit.read'),
    ('ADMIN', 'cms.read'), ('ADMIN', 'cms.write'), ('ADMIN', 'crm.read'), ('ADMIN', 'crm.write'), ('ADMIN', 'quotation.create'), ('ADMIN', 'quotation.edit'), ('ADMIN', 'quotation.send'), ('ADMIN', 'contract.create'), ('ADMIN', 'task.create'), ('ADMIN', 'task.assign'), ('ADMIN', 'task.edit'), ('ADMIN', 'project.manage'), ('ADMIN', 'kpi.read_self'), ('ADMIN', 'kpi.read_team'), ('ADMIN', 'leave.request'), ('ADMIN', 'leave.approve'), ('ADMIN', 'payroll.read_self'), ('ADMIN', 'recruitment.manage'), ('ADMIN', 'finance.read'), ('ADMIN', 'finance.create'), ('ADMIN', 'hr.read'), ('ADMIN', 'hr.manage'), ('ADMIN', 'users.manage'), ('ADMIN', 'settings.manage'), ('ADMIN', 'audit.read'),
    ('HR_MANAGER', 'leave.request'), ('HR_MANAGER', 'leave.approve'), ('HR_MANAGER', 'payroll.read_self'), ('HR_MANAGER', 'recruitment.manage'), ('HR_MANAGER', 'hr.read'), ('HR_MANAGER', 'hr.manage'), ('HR_MANAGER', 'kpi.read_self'), ('HR_MANAGER', 'kpi.read_team'),
    ('HR_STAFF', 'leave.request'), ('HR_STAFF', 'payroll.read_self'), ('HR_STAFF', 'recruitment.manage'), ('HR_STAFF', 'hr.read'),
    ('FINANCE_MANAGER', 'finance.read'), ('FINANCE_MANAGER', 'finance.create'), ('FINANCE_MANAGER', 'finance.approve'), ('FINANCE_MANAGER', 'payroll.read_self'), ('FINANCE_MANAGER', 'payroll.manage'), ('FINANCE_MANAGER', 'kpi.read_self'), ('FINANCE_MANAGER', 'kpi.read_team'),
    ('FINANCE_STAFF', 'finance.read'), ('FINANCE_STAFF', 'finance.create'), ('FINANCE_STAFF', 'payroll.read_self'),
    ('SALES_MANAGER', 'crm.read'), ('SALES_MANAGER', 'crm.write'), ('SALES_MANAGER', 'quotation.create'), ('SALES_MANAGER', 'quotation.edit'), ('SALES_MANAGER', 'quotation.approve'), ('SALES_MANAGER', 'quotation.send'), ('SALES_MANAGER', 'contract.create'), ('SALES_MANAGER', 'kpi.read_self'), ('SALES_MANAGER', 'kpi.read_team'),
    ('SALES_STAFF', 'crm.read'), ('SALES_STAFF', 'crm.write'), ('SALES_STAFF', 'quotation.create'), ('SALES_STAFF', 'quotation.edit'), ('SALES_STAFF', 'quotation.send'), ('SALES_STAFF', 'leave.request'), ('SALES_STAFF', 'payroll.read_self'), ('SALES_STAFF', 'kpi.read_self'),
    ('PROJECT_MANAGER', 'project.manage'), ('PROJECT_MANAGER', 'task.create'), ('PROJECT_MANAGER', 'task.assign'), ('PROJECT_MANAGER', 'task.edit'), ('PROJECT_MANAGER', 'leave.request'), ('PROJECT_MANAGER', 'leave.approve'), ('PROJECT_MANAGER', 'kpi.read_self'), ('PROJECT_MANAGER', 'kpi.read_team'),
    ('TEAM_LEAD', 'task.create'), ('TEAM_LEAD', 'task.assign'), ('TEAM_LEAD', 'task.edit'), ('TEAM_LEAD', 'leave.request'), ('TEAM_LEAD', 'leave.approve'), ('TEAM_LEAD', 'kpi.read_self'), ('TEAM_LEAD', 'kpi.read_team'),
    ('TECHNICAL_STAFF', 'task.edit'), ('TECHNICAL_STAFF', 'leave.request'), ('TECHNICAL_STAFF', 'payroll.read_self'), ('TECHNICAL_STAFF', 'kpi.read_self'),
    ('SUPPORT_STAFF', 'task.edit'), ('SUPPORT_STAFF', 'leave.request'), ('SUPPORT_STAFF', 'payroll.read_self'), ('SUPPORT_STAFF', 'kpi.read_self'),
    ('CONTENT_EDITOR', 'cms.read'), ('CONTENT_EDITOR', 'cms.write'), ('CONTENT_EDITOR', 'cms.publish'), ('CONTENT_EDITOR', 'leave.request'), ('CONTENT_EDITOR', 'payroll.read_self'),
    ('EMPLOYEE', 'leave.request'), ('EMPLOYEE', 'payroll.read_self'), ('EMPLOYEE', 'kpi.read_self'),
    ('VIEWER', 'cms.read'), ('VIEWER', 'crm.read'), ('VIEWER', 'finance.read'), ('VIEWER', 'kpi.read_self')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from role_permissions_seed
join public.roles as role on role.code = role_permissions_seed.role_code and role.workspace_id is null
join public.permissions as permission on permission.code = role_permissions_seed.permission_code
on conflict do nothing;

-- The authorization catalogue is readable by signed-in staff. Assignments remain private.
grant select on public.roles, public.permissions, public.role_permissions, public.user_roles to authenticated;
create policy "authenticated users read system roles" on public.roles for select to authenticated using (workspace_id is null);
create policy "authenticated users read permission catalogue" on public.permissions for select to authenticated using (true);
create policy "authenticated users read role permission catalogue" on public.role_permissions for select to authenticated using (true);
create policy "users read their own role assignments" on public.user_roles for select to authenticated using (user_id = (select auth.uid()));

-- Limit profile edits to personal display data; account placement and activation stay administrative.
grant update (full_name, job_title, avatar_path, locale) on public.profiles to authenticated;

-- Staff identity/self-service policies. All operational tables not named here remain locked
-- until their module-specific workflows and UI have been introduced.
grant select on public.employees, public.leave_types, public.payslips to authenticated;
grant select, insert, update on public.leave_requests to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "staff read permitted profiles" on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select private.has_permission('users.manage', workspace_id)));
create policy "staff read employees" on public.employees for select to authenticated
  using ((select private.owns_employee(id)) or (select private.has_permission('hr.read', workspace_id)) or (select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)));
create policy "staff read leave types" on public.leave_types for select to authenticated
  using ((select private.has_permission('leave.request', workspace_id)) or (select private.has_permission('leave.approve', workspace_id)));
create policy "employees read their leave requests" on public.leave_requests for select to authenticated
  using ((select private.owns_employee(employee_id)) or (select private.has_permission('leave.approve', private.leave_request_workspace(id))));
create policy "employees create their leave requests" on public.leave_requests for insert to authenticated
  with check ((select private.owns_employee(employee_id)) and (select private.leave_request_is_valid(employee_id, leave_type_id)) and status in ('draft', 'submitted') and approver_id is null and decided_at is null);
create policy "employees update their draft leave requests" on public.leave_requests for update to authenticated
  using ((select private.owns_employee(employee_id)) and status = 'draft')
  with check ((select private.owns_employee(employee_id)) and (select private.leave_request_is_valid(employee_id, leave_type_id)) and status in ('draft', 'submitted') and approver_id is null and decided_at is null);
create policy "authorized staff decide leave requests" on public.leave_requests for update to authenticated
  using ((select private.has_permission('leave.approve', private.leave_request_workspace(id))) and status in ('submitted', 'in_review'))
  with check ((select private.has_permission('leave.approve', private.leave_request_workspace(id))) and status in ('approved', 'rejected'));
create policy "employees read their payslips" on public.payslips for select to authenticated
  using ((select private.payslip_is_self(id)) or (select private.has_permission('payroll.manage', private.payslip_workspace(id))));

-- Existing notification policy is ownership-bound; this grant makes marking a notification
-- read possible without allowing a client to alter its recipient or content.
