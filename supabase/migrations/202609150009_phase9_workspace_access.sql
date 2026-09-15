-- Allows CRM-capable staff to resolve the workspace tenant for scoped records.
grant select on public.workspaces to authenticated;
create policy "crm staff read workspaces" on public.workspaces for select to authenticated
  using ((select private.has_permission('crm.read', id)) or (select private.has_permission('crm.write', id)));
