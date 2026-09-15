-- Phase 11: quotation engine access, version audit, and commercial calculations.

create or replace function private.quotation_workspace(target_quotation_id uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select workspace_id from public.quotations where id = target_quotation_id; $$;

create or replace function private.log_quotation_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_events (workspace_id, actor_id, entity_type, entity_id, action, payload)
  values (new.workspace_id, (select auth.uid()), 'quotations', new.id, lower(tg_op), jsonb_build_object('quotation_number', new.quotation_number, 'status', new.status, 'version_number', new.version_number, 'total_amount', new.total_amount));
  return new;
end; $$;

revoke all on function private.quotation_workspace(uuid), private.log_quotation_change() from public, anon, authenticated;
grant execute on function private.quotation_workspace(uuid) to authenticated;

grant select, insert, update on public.quotations, public.quotation_items, public.quotation_versions to authenticated;
create policy "quotation staff read" on public.quotations for select to authenticated using ((select private.has_permission('quotation.create', workspace_id)) or (select private.has_permission('quotation.edit', workspace_id)) or (select private.has_permission('quotation.approve', workspace_id)) or (select private.has_permission('quotation.send', workspace_id)));
create policy "quotation staff create drafts" on public.quotations for insert to authenticated with check ((select private.has_permission('quotation.create', workspace_id)) and status = 'draft' and approved_by is null);
create policy "quotation staff edit drafts" on public.quotations for update to authenticated using ((select private.has_permission('quotation.edit', workspace_id)) and status = 'draft') with check ((select private.has_permission('quotation.edit', workspace_id)) and status in ('draft', 'submitted') and approved_by is null);
create policy "quotation approvers decide" on public.quotations for update to authenticated using ((select private.has_permission('quotation.approve', workspace_id)) and status in ('submitted', 'in_review')) with check ((select private.has_permission('quotation.approve', workspace_id)) and status in ('approved', 'rejected'));
create policy "quotation staff read items" on public.quotation_items for select to authenticated using ((select private.has_permission('quotation.create', private.quotation_workspace(quotation_id))) or (select private.has_permission('quotation.edit', private.quotation_workspace(quotation_id))) or (select private.has_permission('quotation.approve', private.quotation_workspace(quotation_id))));
create policy "quotation staff write items" on public.quotation_items for insert to authenticated with check ((select private.has_permission('quotation.edit', private.quotation_workspace(quotation_id))) or (select private.has_permission('quotation.create', private.quotation_workspace(quotation_id))));
create policy "quotation staff read versions" on public.quotation_versions for select to authenticated using ((select private.has_permission('quotation.edit', private.quotation_workspace(quotation_id))) or (select private.has_permission('quotation.approve', private.quotation_workspace(quotation_id))));
create policy "quotation staff create versions" on public.quotation_versions for insert to authenticated with check ((select private.has_permission('quotation.edit', private.quotation_workspace(quotation_id))) and created_by = (select auth.uid()));

drop trigger if exists quotation_audit_change on public.quotations;
create trigger quotation_audit_change after insert or update on public.quotations for each row execute procedure private.log_quotation_change();
