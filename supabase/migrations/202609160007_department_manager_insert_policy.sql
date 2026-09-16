-- The organization manager is also available to HR managers. Keep inserts
-- scoped to the current workspace and the existing permission model.

drop policy if exists "hr managers create departments" on public.departments;
create policy "hr managers create departments" on public.departments
  for insert to authenticated
  with check ((select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)));
