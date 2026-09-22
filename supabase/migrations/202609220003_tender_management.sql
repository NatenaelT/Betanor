-- Tender management, securities, submission workflow, and role-aware access.
-- Existing customers, employees, tasks, documents, letters, finance, and
-- notifications remain the owning domains; these tables only add tender links.

insert into public.permissions (code, module, description)
values
  ('tender.read', 'tenders', 'Read tender records and submission work'),
  ('tender.create', 'tenders', 'Create tender records and requirements'),
  ('tender.edit', 'tenders', 'Edit tenders, requirements, and activities'),
  ('tender.manage_guarantees', 'tenders', 'Manage CPO and bank guarantee records'),
  ('tender.submit', 'tenders', 'Complete checklists and record final tender submissions'),
  ('tender.view_all', 'tenders', 'View all workspace tenders regardless of assignment')
on conflict (code) do update set module = excluded.module, description = excluded.description;

with seed(role_code, permission_code) as (
  values
    ('SUPER_ADMIN', 'tender.read'), ('SUPER_ADMIN', 'tender.create'), ('SUPER_ADMIN', 'tender.edit'), ('SUPER_ADMIN', 'tender.manage_guarantees'), ('SUPER_ADMIN', 'tender.submit'), ('SUPER_ADMIN', 'tender.view_all'),
    ('ADMIN', 'tender.read'), ('ADMIN', 'tender.create'), ('ADMIN', 'tender.edit'), ('ADMIN', 'tender.manage_guarantees'), ('ADMIN', 'tender.submit'), ('ADMIN', 'tender.view_all'),
    ('MANAGEMENT', 'tender.read'), ('MANAGEMENT', 'tender.view_all'), ('MANAGEMENT', 'tender.submit'),
    ('SALES_MANAGER', 'tender.read'), ('SALES_MANAGER', 'tender.create'), ('SALES_MANAGER', 'tender.edit'), ('SALES_MANAGER', 'tender.submit'),
    ('SALES_STAFF', 'tender.read'), ('SALES_STAFF', 'tender.create'), ('SALES_STAFF', 'tender.edit'),
    ('FINANCE_MANAGER', 'tender.read'), ('FINANCE_MANAGER', 'tender.manage_guarantees'),
    ('FINANCE_STAFF', 'tender.read'), ('FINANCE_STAFF', 'tender.manage_guarantees'),
    ('PROJECT_MANAGER', 'tender.read'), ('PROJECT_MANAGER', 'tender.edit'),
    ('TEAM_LEAD', 'tender.read'), ('TEAM_LEAD', 'tender.edit'),
    ('VIEWER', 'tender.read')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from seed
join public.roles role on role.code = seed.role_code and role.workspace_id is null
join public.permissions permission on permission.code = seed.permission_code
on conflict do nothing;

create table if not exists public.tenders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reference_number text not null,
  title text not null,
  procuring_organization text,
  description text,
  tender_type text,
  status text not null default 'DRAFT' check (status in ('DRAFT','GO_NO_GO','IN_PROGRESS','READY_FOR_SUBMISSION','SUBMITTED','UNDER_EVALUATION','AWARDED','LOST','CANCELLED')),
  currency_code text not null default 'ETB',
  estimated_value numeric(16,2),
  issue_date date,
  submission_deadline timestamptz,
  owner_id uuid references public.profiles(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, reference_number)
);

create table if not exists public.tender_requirements (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  title text not null,
  description text,
  is_mandatory boolean not null default true,
  is_complete boolean not null default false,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tender_guarantees (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  guarantee_type text not null check (guarantee_type in ('CPO','BANK_GUARANTEE','BID_SECURITY','PERFORMANCE_GUARANTEE','ADVANCE_PAYMENT_GUARANTEE','OTHER_GUARANTEE')),
  financial_institution text,
  reference_number text not null,
  amount numeric(16,2) not null default 0,
  currency_code text not null default 'ETB',
  issue_date date,
  expiry_date date,
  beneficiary text,
  purpose text,
  status text not null default 'REQUESTED' check (status in ('REQUESTED','IN_PREPARATION','ISSUED','SUBMITTED','ACTIVE','EXPIRING_SOON','RETURNED','RELEASED','EXPIRED','CANCELLED')),
  responsible_user_id uuid references public.profiles(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  submitted_at timestamptz,
  release_return_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tender_id, reference_number)
);

create table if not exists public.tender_task_links (
  tender_id uuid not null references public.tenders(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  task_type text not null default 'PROPOSAL' check (task_type in ('PROPOSAL','COST_PROPOSAL','REQUIREMENT','REVIEW','OTHER')),
  created_at timestamptz not null default now(),
  primary key (tender_id, task_id)
);

create table if not exists public.tender_activities (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  activity_type text not null,
  body text,
  actor_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tender_submissions (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  submission_date date not null default current_date,
  submission_time timestamptz not null default now(),
  submitted_by uuid references public.profiles(id) on delete set null,
  submission_method text,
  portal_or_location text,
  confirmation_number text,
  submission_letter_id uuid references public.letters(id) on delete set null,
  technical_proposal_version text,
  financial_proposal_version text,
  guarantee_reference text,
  receipt_document_id uuid references public.documents(id) on delete set null,
  final_package_document_id uuid references public.documents(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (tender_id)
);

create index if not exists tenders_workspace_status_deadline_idx on public.tenders(workspace_id, status, submission_deadline);
create index if not exists tenders_owner_idx on public.tenders(owner_id, submission_deadline);
create index if not exists tender_requirements_tender_idx on public.tender_requirements(tender_id, is_mandatory, is_complete);
create index if not exists tender_guarantees_expiry_idx on public.tender_guarantees(tender_id, expiry_date, status);
create index if not exists tender_guarantees_responsible_idx on public.tender_guarantees(responsible_user_id, expiry_date);
create index if not exists tender_activities_tender_idx on public.tender_activities(tender_id, created_at desc);

alter table public.tenders enable row level security;
alter table public.tender_requirements enable row level security;
alter table public.tender_guarantees enable row level security;
alter table public.tender_task_links enable row level security;
alter table public.tender_activities enable row level security;
alter table public.tender_submissions enable row level security;

grant select, insert, update on public.tenders to authenticated;
grant select, insert, update on public.tender_requirements to authenticated;
grant select, insert, update on public.tender_guarantees to authenticated;
grant select, insert, delete on public.tender_task_links to authenticated;
grant select, insert on public.tender_activities to authenticated;
grant select, insert on public.tender_submissions to authenticated;

create policy tender_read on public.tenders for select to authenticated
  using ((select private.has_permission('tender.view_all', workspace_id))
    or (select private.has_permission('tender.read', workspace_id) and (owner_id = (select auth.uid()) or created_by = (select auth.uid()))));
create policy tender_create on public.tenders for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_permission('tender.create', workspace_id)));
create policy tender_edit on public.tenders for update to authenticated
  using ((select private.has_permission('tender.edit', workspace_id)) or owner_id = (select auth.uid()))
  with check ((select private.has_permission('tender.edit', workspace_id)) or owner_id = (select auth.uid()));

create policy tender_requirements_read on public.tender_requirements for select to authenticated
  using (exists (select 1 from public.tenders tender where tender.id = tender_requirements.tender_id and (select private.has_permission('tender.read', tender.workspace_id))));
create policy tender_requirements_write on public.tender_requirements for all to authenticated
  using (exists (select 1 from public.tenders tender where tender.id = tender_requirements.tender_id and (select private.has_permission('tender.edit', tender.workspace_id))))
  with check (exists (select 1 from public.tenders tender where tender.id = tender_requirements.tender_id and (select private.has_permission('tender.edit', tender.workspace_id))));

create policy tender_guarantees_read on public.tender_guarantees for select to authenticated
  using (exists (select 1 from public.tenders tender where tender.id = tender_guarantees.tender_id and (select private.has_permission('tender.read', tender.workspace_id))));
create policy tender_guarantees_manage on public.tender_guarantees for all to authenticated
  using (exists (select 1 from public.tenders tender where tender.id = tender_guarantees.tender_id and (select private.has_permission('tender.manage_guarantees', tender.workspace_id))))
  with check (exists (select 1 from public.tenders tender where tender.id = tender_guarantees.tender_id and (select private.has_permission('tender.manage_guarantees', tender.workspace_id))));

create policy tender_task_links_read on public.tender_task_links for select to authenticated
  using (exists (select 1 from public.tenders tender where tender.id = tender_task_links.tender_id and (select private.has_permission('tender.read', tender.workspace_id))));
create policy tender_task_links_manage on public.tender_task_links for all to authenticated
  using (exists (select 1 from public.tenders tender where tender.id = tender_task_links.tender_id and ((select private.has_permission('tender.edit', tender.workspace_id)) or (select private.has_permission('task.assign', tender.workspace_id)))))
  with check (exists (select 1 from public.tenders tender where tender.id = tender_task_links.tender_id and ((select private.has_permission('tender.edit', tender.workspace_id)) or (select private.has_permission('task.assign', tender.workspace_id)))));

create policy tender_activities_read on public.tender_activities for select to authenticated
  using (exists (select 1 from public.tenders tender where tender.id = tender_activities.tender_id and (select private.has_permission('tender.read', tender.workspace_id))));
create policy tender_activities_create on public.tender_activities for insert to authenticated
  with check (actor_id = (select auth.uid()) and exists (select 1 from public.tenders tender where tender.id = tender_activities.tender_id and (select private.has_permission('tender.edit', tender.workspace_id))));

create policy tender_submissions_read on public.tender_submissions for select to authenticated
  using (exists (select 1 from public.tenders tender where tender.id = tender_submissions.tender_id and (select private.has_permission('tender.read', tender.workspace_id))));
create policy tender_submissions_create on public.tender_submissions for insert to authenticated
  with check (submitted_by = (select auth.uid()) and exists (select 1 from public.tenders tender where tender.id = tender_submissions.tender_id and (select private.has_permission('tender.submit', tender.workspace_id))));
