-- HR may link an employee record to an authenticated profile so the employee
-- can use self-service leave and see their own salary-linked information.
create policy "hr read profiles for employee linking" on public.profiles
  for select to authenticated
  using (
    (select private.has_permission('hr.read', workspace_id))
    or (select private.has_permission('hr.manage', workspace_id))
  );
