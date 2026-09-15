-- Let finance-capable staff resolve the single tenant workspace without exposing
-- workspace rows to unrelated authenticated users.
create policy "finance staff read workspaces" on public.workspaces for select to authenticated
  using ((select private.has_permission('finance.read', id)) or (select private.has_permission('finance.create', id)));
