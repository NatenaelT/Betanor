-- Work module access: projects, milestones, tasks, assignments, and comments.
-- All policies are workspace-scoped through the central RBAC helper.

grant select, insert, update on public.tasks to authenticated;
grant select, insert, update, delete on public.task_assignees to authenticated;
grant select, insert, update, delete on public.task_comments to authenticated;

create policy "task staff read" on public.tasks
  for select to authenticated
  using ((select private.has_permission('task.create', workspace_id))
      or (select private.has_permission('task.edit', workspace_id))
      or (select private.has_permission('task.assign', workspace_id))
      or (select private.has_permission('project.manage', workspace_id)));

create policy "task staff create" on public.tasks
  for insert to authenticated
  with check ((select private.has_permission('task.create', workspace_id))
      and created_by = (select auth.uid()));

create policy "task staff update" on public.tasks
  for update to authenticated
  using ((select private.has_permission('task.edit', workspace_id))
      or (select private.has_permission('task.create', workspace_id))
      or (select private.has_permission('project.manage', workspace_id)))
  with check ((select private.has_permission('task.edit', workspace_id))
      or (select private.has_permission('task.create', workspace_id))
      or (select private.has_permission('project.manage', workspace_id)));

create policy "task assignee staff read" on public.task_assignees
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_assignees.task_id
    and ((select private.has_permission('task.create', t.workspace_id))
      or (select private.has_permission('task.edit', t.workspace_id))
      or (select private.has_permission('task.assign', t.workspace_id))
      or (select private.has_permission('project.manage', t.workspace_id)))));

create policy "task assignee staff manage" on public.task_assignees
  for all to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_assignees.task_id
    and (select private.has_permission('task.assign', t.workspace_id))))
  with check (exists (select 1 from public.tasks t where t.id = task_assignees.task_id
    and (select private.has_permission('task.assign', t.workspace_id))));

create policy "task comment staff read" on public.task_comments
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_comments.task_id
    and ((select private.has_permission('task.create', t.workspace_id))
      or (select private.has_permission('task.edit', t.workspace_id))
      or (select private.has_permission('task.assign', t.workspace_id))
      or (select private.has_permission('project.manage', t.workspace_id)))));

create policy "task comment staff create" on public.task_comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and exists (select 1 from public.tasks t where t.id = task_comments.task_id
    and ((select private.has_permission('task.edit', t.workspace_id))
      or (select private.has_permission('task.create', t.workspace_id))
      or (select private.has_permission('project.manage', t.workspace_id)))));

create policy "task comment author update" on public.task_comments
  for update to authenticated
  using (author_id = (select auth.uid()) and exists (select 1 from public.tasks t where t.id = task_comments.task_id
    and ((select private.has_permission('task.edit', t.workspace_id))
      or (select private.has_permission('task.create', t.workspace_id))
      or (select private.has_permission('project.manage', t.workspace_id)))))
  with check (author_id = (select auth.uid()));

create policy "task comment author delete" on public.task_comments
  for delete to authenticated
  using (author_id = (select auth.uid()));

create index if not exists tasks_workspace_status_due_idx on public.tasks(workspace_id, status, due_on);
create index if not exists task_assignees_employee_idx on public.task_assignees(employee_id, task_id);
create index if not exists task_comments_task_created_idx on public.task_comments(task_id, created_at desc);
