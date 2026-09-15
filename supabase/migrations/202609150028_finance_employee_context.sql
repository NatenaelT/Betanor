-- Requester labels are non-sensitive context for the finance queue. Salary and
-- personal HR fields remain governed by the existing HR/self-service policies.
create policy "finance staff read employee context" on public.employees for select to authenticated
  using ((select private.has_permission('finance.read', workspace_id)) or (select private.has_permission('finance.create', workspace_id)));
