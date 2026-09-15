-- Finance screens need context labels for the tenant's projects, departments,
-- and customers. These are read-only joins; writes stay with owning modules.
create policy "finance staff read departments" on public.departments for select to authenticated
  using ((select private.has_permission('finance.read', workspace_id)) or (select private.has_permission('finance.create', workspace_id)));
create policy "finance staff read projects" on public.projects for select to authenticated
  using ((select private.has_permission('finance.read', workspace_id)) or (select private.has_permission('finance.create', workspace_id)));
create policy "finance staff read customers" on public.customers for select to authenticated
  using ((select private.has_permission('finance.read', workspace_id)) or (select private.has_permission('finance.create', workspace_id)));
