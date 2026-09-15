-- Phase 14: Ethiopian contract-record controls and expiry tracking.
alter table public.contracts add column if not exists contract_language text not null default 'English';
alter table public.contracts add column if not exists governing_law text not null default 'Federal Democratic Republic of Ethiopia';
alter table public.contracts add column if not exists place_of_execution text;
alter table public.contracts add column if not exists supplier_tin text;
alter table public.contracts add column if not exists customer_tin text;
alter table public.contracts add column if not exists signed_at timestamptz;
alter table public.contracts add column if not exists expiry_notice_days integer not null default 30 check (expiry_notice_days between 1 and 365);

grant select, insert, update on public.contracts, public.contract_versions to authenticated;
create policy "contract staff read" on public.contracts for select to authenticated using ((select private.has_permission('contract.read', workspace_id)) or (select private.has_permission('contract.create', workspace_id)) or (select private.has_permission('contract.edit', workspace_id)) or (select private.has_permission('contract.approve', workspace_id)));
create policy "contract staff create draft" on public.contracts for insert to authenticated with check ((select private.has_permission('contract.create', workspace_id)) and status = 'draft');
create policy "contract staff edit draft" on public.contracts for update to authenticated using ((select private.has_permission('contract.edit', workspace_id)) and status = 'draft') with check ((select private.has_permission('contract.edit', workspace_id)));
create policy "contract approvers decide" on public.contracts for update to authenticated using ((select private.has_permission('contract.approve', workspace_id)) and status in ('submitted', 'in_review')) with check ((select private.has_permission('contract.approve', workspace_id)) and status in ('approved', 'rejected'));
