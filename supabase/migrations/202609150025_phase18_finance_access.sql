-- Phase 18: operational finance access and Ethiopian invoice evidence.
-- Finance remains permission-scoped; ordinary public callers stay blocked.

alter table public.invoices add column if not exists subtotal numeric(14,2) not null default 0;
alter table public.invoices add column if not exists vat_rate numeric(7,4) not null default 0;
alter table public.invoices add column if not exists tax_amount numeric(14,2) not null default 0;
alter table public.invoices add column if not exists tax_inclusive boolean not null default false;
alter table public.invoices add column if not exists supplier_tin text;
alter table public.invoices add column if not exists supplier_vat_registration_number text;
alter table public.invoices add column if not exists customer_tin text;
alter table public.invoices add column if not exists customer_vat_registration_number text;
alter table public.invoices add column if not exists payment_terms text;
alter table public.invoices add column if not exists place_of_supply text;
alter table public.invoices add column if not exists governing_law text not null default 'Federal Democratic Republic of Ethiopia';

alter table public.invoices drop constraint if exists invoices_subtotal_check;
alter table public.invoices add constraint invoices_subtotal_check check (subtotal >= 0);
alter table public.invoices drop constraint if exists invoices_vat_rate_check;
alter table public.invoices add constraint invoices_vat_rate_check check (vat_rate >= 0 and vat_rate <= 100);
alter table public.invoices drop constraint if exists invoices_tax_amount_check;
alter table public.invoices add constraint invoices_tax_amount_check check (tax_amount >= 0);
alter table public.invoices drop constraint if exists invoices_total_amount_check;
alter table public.invoices add constraint invoices_total_amount_check check (total_amount >= 0);
alter table public.expenses drop constraint if exists expenses_amount_check;
alter table public.expenses add constraint expenses_amount_check check (amount >= 0);
alter table public.budgets drop constraint if exists budgets_planned_amount_check;
alter table public.budgets add constraint budgets_planned_amount_check check (planned_amount >= 0);
alter table public.payments drop constraint if exists payments_amount_check;
alter table public.payments add constraint payments_amount_check check (amount > 0);

insert into public.permissions (code, module, description)
values ('expense.request', 'finance', 'Submit and revise own expense requests')
on conflict (code) do update set module = excluded.module, description = excluded.description;

with role_seed(role_code) as (values
  ('SUPER_ADMIN'), ('ADMIN'), ('MANAGEMENT'), ('HR_MANAGER'), ('HR_STAFF'),
  ('FINANCE_MANAGER'), ('FINANCE_STAFF'), ('SALES_MANAGER'), ('SALES_STAFF'),
  ('PROJECT_MANAGER'), ('TEAM_LEAD'), ('TECHNICAL_STAFF'), ('SUPPORT_STAFF'),
  ('CONTENT_EDITOR'), ('EMPLOYEE')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from role_seed
join public.roles as role on role.code = role_seed.role_code and role.workspace_id is null
join public.permissions as permission on permission.code = 'expense.request'
on conflict do nothing;

grant select on public.finance_categories, public.budgets, public.expenses, public.expense_approvals,
  public.vendors, public.invoices, public.invoice_lines, public.payments to authenticated;
grant insert, update on public.finance_categories, public.budgets, public.expenses,
  public.vendors, public.invoices, public.invoice_lines, public.payments to authenticated;
grant insert on public.expense_approvals to authenticated;

drop policy if exists deny_direct_client_access on public.finance_categories;
drop policy if exists deny_direct_client_access on public.budgets;
drop policy if exists deny_direct_client_access on public.expenses;
drop policy if exists deny_direct_client_access on public.expense_approvals;
drop policy if exists deny_direct_client_access on public.vendors;
drop policy if exists deny_direct_client_access on public.invoices;
drop policy if exists deny_direct_client_access on public.invoice_lines;
drop policy if exists deny_direct_client_access on public.payments;

create policy "finance staff read categories" on public.finance_categories for select to authenticated
  using ((select private.has_permission('finance.read', workspace_id)));
create policy "finance staff create categories" on public.finance_categories for insert to authenticated
  with check ((select private.has_permission('finance.create', workspace_id)));
create policy "finance staff update categories" on public.finance_categories for update to authenticated
  using ((select private.has_permission('finance.create', workspace_id)))
  with check ((select private.has_permission('finance.create', workspace_id)));

create policy "finance staff read vendors" on public.vendors for select to authenticated
  using ((select private.has_permission('finance.read', workspace_id)));
create policy "finance staff create vendors" on public.vendors for insert to authenticated
  with check ((select private.has_permission('finance.create', workspace_id)));
create policy "finance staff update vendors" on public.vendors for update to authenticated
  using ((select private.has_permission('finance.create', workspace_id)))
  with check ((select private.has_permission('finance.create', workspace_id)));

create policy "finance staff read budgets" on public.budgets for select to authenticated
  using ((select private.has_permission('finance.read', workspace_id)));
create policy "finance staff create budgets" on public.budgets for insert to authenticated
  with check ((select private.has_permission('finance.create', workspace_id)));
create policy "finance staff update budgets" on public.budgets for update to authenticated
  using ((select private.has_permission('finance.create', workspace_id)) or (select private.has_permission('finance.approve', workspace_id)))
  with check ((select private.has_permission('finance.create', workspace_id)) or (select private.has_permission('finance.approve', workspace_id)));

create policy "finance staff and requesters read expenses" on public.expenses for select to authenticated
  using ((select private.has_permission('finance.read', workspace_id)) or ((select private.owns_employee(requested_by)) and (select private.has_permission('expense.request', workspace_id))));
create policy "authorized staff create expenses" on public.expenses for insert to authenticated
  with check (((select private.has_permission('finance.create', workspace_id)) and requested_by is null) or ((select private.has_permission('expense.request', workspace_id)) and (select private.owns_employee(requested_by)) and status in ('draft', 'submitted')));
create policy "requesters revise drafts" on public.expenses for update to authenticated
  using (((select private.owns_employee(requested_by)) and (select private.has_permission('expense.request', workspace_id)) and status = 'draft') or (select private.has_permission('finance.create', workspace_id)) or (select private.has_permission('finance.approve', workspace_id)))
  with check (((select private.owns_employee(requested_by)) and (select private.has_permission('expense.request', workspace_id)) and status in ('draft', 'submitted')) or (select private.has_permission('finance.create', workspace_id)) or (select private.has_permission('finance.approve', workspace_id)));

create policy "finance staff read expense approvals" on public.expense_approvals for select to authenticated
  using (exists (select 1 from public.expenses where expenses.id = expense_approvals.expense_id and (select private.has_permission('finance.read', expenses.workspace_id))));
create policy "finance approvers record decisions" on public.expense_approvals for insert to authenticated
  with check (exists (select 1 from public.expenses where expenses.id = expense_approvals.expense_id and (select private.has_permission('finance.approve', expenses.workspace_id))));

create policy "finance staff read invoices" on public.invoices for select to authenticated
  using ((select private.has_permission('finance.read', workspace_id)));
create policy "finance staff create invoices" on public.invoices for insert to authenticated
  with check ((select private.has_permission('finance.create', workspace_id)));
create policy "finance staff update invoices" on public.invoices for update to authenticated
  using ((select private.has_permission('finance.create', workspace_id)) or (select private.has_permission('finance.approve', workspace_id)))
  with check ((select private.has_permission('finance.create', workspace_id)) or (select private.has_permission('finance.approve', workspace_id)));

create policy "finance staff read invoice lines" on public.invoice_lines for select to authenticated
  using (exists (select 1 from public.invoices where invoices.id = invoice_lines.invoice_id and (select private.has_permission('finance.read', invoices.workspace_id))));
create policy "finance staff create invoice lines" on public.invoice_lines for insert to authenticated
  with check (exists (select 1 from public.invoices where invoices.id = invoice_lines.invoice_id and (select private.has_permission('finance.create', invoices.workspace_id))));
create policy "finance staff update invoice lines" on public.invoice_lines for update to authenticated
  using (exists (select 1 from public.invoices where invoices.id = invoice_lines.invoice_id and (select private.has_permission('finance.create', invoices.workspace_id))))
  with check (exists (select 1 from public.invoices where invoices.id = invoice_lines.invoice_id and (select private.has_permission('finance.create', invoices.workspace_id))));

create policy "finance staff read payments" on public.payments for select to authenticated
  using (exists (select 1 from public.invoices where invoices.id = payments.invoice_id and (select private.has_permission('finance.read', invoices.workspace_id))));
create policy "finance staff record payments" on public.payments for insert to authenticated
  with check (exists (select 1 from public.invoices where invoices.id = payments.invoice_id and (select private.has_permission('finance.create', invoices.workspace_id))));
