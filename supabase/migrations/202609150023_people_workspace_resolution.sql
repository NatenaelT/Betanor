-- Global demo/admin identities may have no profile workspace_id. Let authorized
-- module staff resolve the tenant without exposing unrelated workspaces.
drop policy if exists "crm staff read workspaces" on public.workspaces;
create policy "authorized staff read workspaces" on public.workspaces for select to authenticated
  using ((select private.has_permission('crm.read', id))
      or (select private.has_permission('crm.write', id))
      or (select private.has_permission('hr.read', id))
      or (select private.has_permission('hr.manage', id))
      or (select private.has_permission('recruitment.manage', id))
      or (select private.has_permission('leave.request', id)));
