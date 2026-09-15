-- Betanor Digital Business Platform: initial secure domain model.
-- This migration deliberately exposes only published content. Operational writes are
-- performed by authenticated server workflows until each module receives its RLS policy set.

create extension if not exists pgcrypto;

create type public.record_status as enum ('draft', 'active', 'inactive', 'archived');
create type public.approval_status as enum ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled');
create type public.task_status as enum ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled');
create type public.priority_level as enum ('low', 'medium', 'high', 'urgent');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  legal_name text, timezone text not null default 'Africa/Addis_Ababa', currency_code text not null default 'ETB',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.departments (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.departments(id) on delete set null, name text not null, code text not null,
  status public.record_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, code)
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, workspace_id uuid references public.workspaces(id) on delete set null,
  full_name text, job_title text, avatar_path text, locale text not null default 'en', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.roles (
  id uuid primary key default gen_random_uuid(), workspace_id uuid references public.workspaces(id) on delete cascade,
  code text not null, name text not null, description text, is_system boolean not null default false, created_at timestamptz not null default now(),
  unique (workspace_id, code)
);
create table public.permissions (
  id uuid primary key default gen_random_uuid(), code text not null unique, module text not null, description text not null, created_at timestamptz not null default now()
);
create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade, permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);
create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade, role_id uuid not null references public.roles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null, assigned_at timestamptz not null default now(), primary key (user_id, role_id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid unique references public.profiles(id) on delete set null, department_id uuid references public.departments(id) on delete set null,
  manager_id uuid references public.employees(id) on delete set null, employee_number text not null, first_name text not null, last_name text not null,
  work_email text, work_phone text, hire_date date, employment_status public.record_status not null default 'active', metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (workspace_id, employee_number)
);
create table public.employment_contracts (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id) on delete cascade,
  contract_number text not null, title text not null, starts_on date not null, ends_on date, salary_amount numeric(14,2), currency_code text not null default 'ETB',
  status public.approval_status not null default 'draft', document_path text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (employee_id, contract_number)
);
create table public.candidates (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  first_name text not null, last_name text not null, email text, phone text, resume_path text, source text, status public.approval_status not null default 'draft', metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.job_openings (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, department_id uuid references public.departments(id) on delete set null,
  title text not null, code text, description text, opens_on date, closes_on date, status public.record_status not null default 'draft', published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.job_applications (
  id uuid primary key default gen_random_uuid(), job_opening_id uuid not null references public.job_openings(id) on delete cascade, candidate_id uuid not null references public.candidates(id) on delete cascade,
  stage text not null default 'applied', applied_at timestamptz not null default now(), notes text, unique (job_opening_id, candidate_id)
);
create table public.leave_types (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, name text not null, code text not null,
  is_paid boolean not null default true, annual_allowance numeric(8,2), unique (workspace_id, code)
);
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id) on delete cascade, leave_type_id uuid not null references public.leave_types(id),
  starts_on date not null, ends_on date not null, duration_days numeric(6,2) not null, reason text, status public.approval_status not null default 'draft',
  approver_id uuid references public.employees(id) on delete set null, decided_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (ends_on >= starts_on)
);
create table public.payroll_cycles (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, period_start date not null, period_end date not null,
  status public.approval_status not null default 'draft', processed_at timestamptz, unique (workspace_id, period_start, period_end), check (period_end >= period_start)
);
create table public.payslips (
  id uuid primary key default gen_random_uuid(), payroll_cycle_id uuid not null references public.payroll_cycles(id) on delete cascade, employee_id uuid not null references public.employees(id) on delete cascade,
  gross_pay numeric(14,2) not null default 0, deductions numeric(14,2) not null default 0, net_pay numeric(14,2) not null default 0, currency_code text not null default 'ETB',
  status public.approval_status not null default 'draft', document_path text, created_at timestamptz not null default now(), unique (payroll_cycle_id, employee_id)
);

create table public.strategies (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, title text not null, description text,
  starts_on date, ends_on date, status public.record_status not null default 'draft', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.annual_goals (
  id uuid primary key default gen_random_uuid(), strategy_id uuid not null references public.strategies(id) on delete cascade, title text not null, description text,
  fiscal_year integer not null, owner_id uuid references public.employees(id) on delete set null, status public.record_status not null default 'draft', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.department_goals (
  id uuid primary key default gen_random_uuid(), annual_goal_id uuid not null references public.annual_goals(id) on delete cascade, department_id uuid not null references public.departments(id) on delete cascade,
  title text not null, description text, owner_id uuid references public.employees(id) on delete set null, status public.record_status not null default 'draft', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.initiatives (
  id uuid primary key default gen_random_uuid(), department_goal_id uuid references public.department_goals(id) on delete set null, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null, description text, owner_id uuid references public.employees(id) on delete set null, status public.record_status not null default 'draft', starts_on date, ends_on date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.kpis (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, department_id uuid references public.departments(id) on delete set null,
  annual_goal_id uuid references public.annual_goals(id) on delete set null, department_goal_id uuid references public.department_goals(id) on delete set null,
  name text not null, description text, unit text not null, target_value numeric(16,2), current_value numeric(16,2) not null default 0,
  period_start date, period_end date, owner_id uuid references public.employees(id) on delete set null, status public.record_status not null default 'draft', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, name text not null, legal_name text,
  email text, phone text, address text, industry_id uuid, status public.record_status not null default 'active', metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on delete cascade, first_name text not null, last_name text not null,
  title text, email text, phone text, is_primary boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.leads (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, customer_id uuid references public.customers(id) on delete set null,
  contact_id uuid references public.customer_contacts(id) on delete set null, source text not null, title text not null, description text, owner_id uuid references public.employees(id) on delete set null,
  status public.approval_status not null default 'draft', priority public.priority_level not null default 'medium', estimated_value numeric(14,2), currency_code text not null default 'ETB',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.lead_activities (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade, activity_type text not null, body text, due_at timestamptz,
  completed_at timestamptz, created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
create table public.consultation_requests (
  id uuid primary key default gen_random_uuid(), workspace_id uuid references public.workspaces(id) on delete set null, name text not null, organization text, email text not null,
  phone text, topic text, requirements text, status public.approval_status not null default 'submitted', lead_id uuid references public.leads(id) on delete set null, created_at timestamptz not null default now()
);
create table public.partner_enquiries (
  id uuid primary key default gen_random_uuid(), workspace_id uuid references public.workspaces(id) on delete set null, name text not null, organization text not null, email text not null,
  phone text, interest text not null, details text not null, status public.approval_status not null default 'submitted', created_at timestamptz not null default now()
);
create table public.rfq_requests (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, reference text not null unique,
  customer_id uuid references public.customers(id) on delete set null, contact_id uuid references public.customer_contacts(id) on delete set null, lead_id uuid references public.leads(id) on delete set null,
  requester_name text not null, requester_email text, requester_phone text, organization text, request_type text, requirements text, timeline text,
  status public.approval_status not null default 'submitted', assigned_to uuid references public.employees(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.rfq_items (
  id uuid primary key default gen_random_uuid(), rfq_id uuid not null references public.rfq_requests(id) on delete cascade, description text not null, quantity numeric(14,2) not null default 1,
  unit text, specifications jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.quotations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, quotation_number text not null unique,
  rfq_id uuid references public.rfq_requests(id) on delete set null, customer_id uuid references public.customers(id) on delete set null, contact_id uuid references public.customer_contacts(id) on delete set null,
  title text not null, quotation_date date not null default current_date, expires_on date, currency_code text not null default 'ETB', subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0, total_amount numeric(14,2) not null default 0, status public.approval_status not null default 'draft', version_number integer not null default 1,
  prepared_by uuid references public.employees(id) on delete set null, approved_by uuid references public.employees(id) on delete set null, accepted_at timestamptz, rejected_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.quotation_items (
  id uuid primary key default gen_random_uuid(), quotation_id uuid not null references public.quotations(id) on delete cascade, line_number integer not null,
  item_type text not null, description text not null, quantity numeric(14,2) not null default 1, unit_price numeric(14,2) not null default 0, tax_rate numeric(7,4) not null default 0,
  line_total numeric(14,2) not null default 0, unique (quotation_id, line_number)
);
create table public.quotation_versions (
  id uuid primary key default gen_random_uuid(), quotation_id uuid not null references public.quotations(id) on delete cascade, version_number integer not null,
  snapshot jsonb not null, change_note text, created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), unique (quotation_id, version_number)
);
create table public.contracts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, contract_number text not null unique,
  quotation_id uuid references public.quotations(id) on delete set null, customer_id uuid references public.customers(id) on delete set null, title text not null,
  starts_on date, ends_on date, currency_code text not null default 'ETB', value_amount numeric(14,2), status public.approval_status not null default 'draft', document_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.contract_versions (
  id uuid primary key default gen_random_uuid(), contract_id uuid not null references public.contracts(id) on delete cascade, version_number integer not null, document_path text,
  summary text, created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), unique (contract_id, version_number)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, project_code text not null unique, name text not null,
  customer_id uuid references public.customers(id) on delete set null, contract_id uuid references public.contracts(id) on delete set null, initiative_id uuid references public.initiatives(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null, project_manager_id uuid references public.employees(id) on delete set null, description text,
  starts_on date, ends_on date, status public.task_status not null default 'not_started', budget_amount numeric(14,2), currency_code text not null default 'ETB',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade, employee_id uuid not null references public.employees(id) on delete cascade,
  role_name text, joined_at timestamptz not null default now(), primary key (project_id, employee_id)
);
create table public.milestones (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade, title text not null, description text,
  due_on date, status public.task_status not null default 'not_started', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, project_id uuid references public.projects(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete set null, department_id uuid references public.departments(id) on delete set null, parent_task_id uuid references public.tasks(id) on delete cascade,
  title text not null, description text, status public.task_status not null default 'not_started', priority public.priority_level not null default 'medium',
  starts_on date, due_on date, completed_at timestamptz, created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.task_assignees (task_id uuid not null references public.tasks(id) on delete cascade, employee_id uuid not null references public.employees(id) on delete cascade, assigned_at timestamptz not null default now(), primary key (task_id, employee_id));
create table public.task_comments (id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade, author_id uuid references public.profiles(id) on delete set null, body text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table public.chart_of_accounts (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, account_code text not null, name text not null, account_type text not null, parent_id uuid references public.chart_of_accounts(id) on delete set null, is_active boolean not null default true, unique (workspace_id, account_code));
create table public.finance_categories (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, name text not null, category_type text not null, parent_id uuid references public.finance_categories(id) on delete set null, unique (workspace_id, name, category_type));
create table public.budgets (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, department_id uuid references public.departments(id) on delete set null, project_id uuid references public.projects(id) on delete set null, category_id uuid references public.finance_categories(id) on delete set null, fiscal_year integer not null, planned_amount numeric(14,2) not null, currency_code text not null default 'ETB', status public.approval_status not null default 'draft', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.expenses (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, expense_number text not null unique, requested_by uuid references public.employees(id) on delete set null, department_id uuid references public.departments(id) on delete set null, project_id uuid references public.projects(id) on delete set null, customer_id uuid references public.customers(id) on delete set null, category_id uuid references public.finance_categories(id) on delete set null, expense_date date not null default current_date, amount numeric(14,2) not null, currency_code text not null default 'ETB', description text, receipt_path text, status public.approval_status not null default 'draft', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.expense_approvals (id uuid primary key default gen_random_uuid(), expense_id uuid not null references public.expenses(id) on delete cascade, approver_id uuid references public.employees(id) on delete set null, decision public.approval_status not null, note text, decided_at timestamptz not null default now());
create table public.invoices (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, invoice_number text not null unique, customer_id uuid references public.customers(id) on delete set null, quotation_id uuid references public.quotations(id) on delete set null, contract_id uuid references public.contracts(id) on delete set null, project_id uuid references public.projects(id) on delete set null, issued_on date not null default current_date, due_on date, currency_code text not null default 'ETB', total_amount numeric(14,2) not null default 0, status public.approval_status not null default 'draft', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.invoice_lines (id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id) on delete cascade, line_number integer not null, description text not null, quantity numeric(14,2) not null default 1, unit_price numeric(14,2) not null default 0, line_total numeric(14,2) not null default 0, unique (invoice_id, line_number));
create table public.payments (id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id) on delete cascade, received_on date not null default current_date, amount numeric(14,2) not null, currency_code text not null default 'ETB', method text, reference text, created_at timestamptz not null default now());

create table public.industries (id uuid primary key default gen_random_uuid(), name text not null unique, slug text not null unique, description text, status public.record_status not null default 'draft', published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.customers add constraint customers_industry_id_fkey foreign key (industry_id) references public.industries(id) on delete set null;
create table public.services (id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique, excerpt text, content text, status public.record_status not null default 'draft', published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.service_features (id uuid primary key default gen_random_uuid(), service_id uuid not null references public.services(id) on delete cascade, title text not null, description text, position integer not null default 0);
create table public.product_categories (id uuid primary key default gen_random_uuid(), parent_id uuid references public.product_categories(id) on delete set null, name text not null, slug text not null unique, description text, status public.record_status not null default 'draft', published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.products (id uuid primary key default gen_random_uuid(), category_id uuid references public.product_categories(id) on delete set null, name text not null, slug text not null unique, sku text, model text, brand text, short_description text, description text, specifications jsonb not null default '{}'::jsonb, availability text, warranty text, main_image_path text, status public.record_status not null default 'draft', published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.case_studies (id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique, summary text, content text, industry_id uuid references public.industries(id) on delete set null, status public.record_status not null default 'draft', published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.insights (id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique, excerpt text, content text, author_id uuid references public.profiles(id) on delete set null, status public.record_status not null default 'draft', published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table public.documents (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, file_name text not null, storage_path text not null unique, mime_type text, size_bytes bigint, classification text not null default 'internal', owner_id uuid references public.profiles(id) on delete set null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table public.audit_events (id bigint generated always as identity primary key, workspace_id uuid references public.workspaces(id) on delete cascade, actor_id uuid references public.profiles(id) on delete set null, entity_type text not null, entity_id uuid, action text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table public.notifications (id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id) on delete cascade, type text not null, title text not null, body text, entity_type text, entity_id uuid, read_at timestamptz, created_at timestamptz not null default now());

-- Foreign-key indexes for normal operational access paths.
create index departments_workspace_idx on public.departments(workspace_id); create index employees_workspace_department_idx on public.employees(workspace_id, department_id); create index candidates_workspace_idx on public.candidates(workspace_id); create index job_applications_candidate_idx on public.job_applications(candidate_id); create index leave_requests_employee_status_idx on public.leave_requests(employee_id, status); create index kpis_workspace_department_idx on public.kpis(workspace_id, department_id); create index customers_workspace_idx on public.customers(workspace_id); create index customer_contacts_customer_idx on public.customer_contacts(customer_id); create index leads_workspace_status_idx on public.leads(workspace_id, status); create index rfq_workspace_status_idx on public.rfq_requests(workspace_id, status); create index quotations_workspace_status_idx on public.quotations(workspace_id, status); create index contracts_customer_idx on public.contracts(customer_id); create index projects_workspace_status_idx on public.projects(workspace_id, status); create index tasks_project_status_idx on public.tasks(project_id, status); create index expenses_workspace_status_idx on public.expenses(workspace_id, status); create index invoices_customer_status_idx on public.invoices(customer_id, status); create index audit_events_workspace_created_idx on public.audit_events(workspace_id, created_at desc); create index notifications_recipient_read_idx on public.notifications(recipient_id, read_at);

-- New public tables are private by default. Only explicitly granted content reads are exposed.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

do $$ declare table_name text; begin
  foreach table_name in array array[
    'workspaces','departments','profiles','roles','permissions','role_permissions','user_roles','employees','employment_contracts','candidates','job_openings','job_applications','leave_types','leave_requests','payroll_cycles','payslips','strategies','annual_goals','department_goals','initiatives','kpis','customers','customer_contacts','leads','lead_activities','consultation_requests','partner_enquiries','rfq_requests','rfq_items','quotations','quotation_items','quotation_versions','contracts','contract_versions','projects','project_members','milestones','tasks','task_assignees','task_comments','chart_of_accounts','finance_categories','budgets','expenses','expense_approvals','invoices','invoice_lines','payments','industries','services','service_features','product_categories','products','case_studies','insights','documents','audit_events','notifications'
  ] loop execute format('alter table public.%I enable row level security', table_name); end loop;
end $$;

grant select on public.industries, public.services, public.service_features, public.product_categories, public.products, public.case_studies, public.insights to anon, authenticated;
create policy "published industries are public" on public.industries for select to anon, authenticated using (status = 'active' and published_at is not null);
create policy "published services are public" on public.services for select to anon, authenticated using (status = 'active' and published_at is not null);
create policy "published service features are public" on public.service_features for select to anon, authenticated using (exists (select 1 from public.services s where s.id = service_id and s.status = 'active' and s.published_at is not null));
create policy "published product categories are public" on public.product_categories for select to anon, authenticated using (status = 'active' and published_at is not null);
create policy "published products are public" on public.products for select to anon, authenticated using (status = 'active' and published_at is not null);
create policy "published case studies are public" on public.case_studies for select to anon, authenticated using (status = 'active' and published_at is not null);
create policy "published insights are public" on public.insights for select to anon, authenticated using (status = 'active' and published_at is not null);

grant select on public.profiles, public.notifications to authenticated;
create policy "users read their own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "users update their own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "users read their own notifications" on public.notifications for select to authenticated using ((select auth.uid()) = recipient_id);
create policy "users update their own notifications" on public.notifications for update to authenticated using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);
