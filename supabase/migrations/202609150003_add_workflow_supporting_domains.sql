-- Supporting domains for workflows that cross CRM, chat, approvals, documents, HR, and finance.

create table public.positions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null, title text not null, code text, status public.record_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (workspace_id, code)
);
alter table public.employees add column position_id uuid references public.positions(id) on delete set null;
alter table public.job_applications add column hired_employee_id uuid references public.employees(id) on delete set null;

create table public.opportunities (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null, lead_id uuid references public.leads(id) on delete set null,
  title text not null, stage text not null default 'qualified', owner_id uuid references public.employees(id) on delete set null,
  expected_value numeric(14,2), currency_code text not null default 'ETB', expected_close_on date, status public.record_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.quotations add column opportunity_id uuid references public.opportunities(id) on delete set null;

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reference text not null unique, customer_id uuid references public.customers(id) on delete set null, lead_id uuid references public.leads(id) on delete set null,
  guest_name text, guest_organization text, guest_email text, guest_phone text, topic text, secure_guest_token_hash text,
  assigned_to uuid references public.employees(id) on delete set null, priority public.priority_level not null default 'medium', status text not null default 'waiting',
  opened_at timestamptz not null default now(), resolved_at timestamptz, closed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null, sender_kind text not null check (sender_kind in ('guest','agent','system')),
  body text not null, is_internal boolean not null default false, created_at timestamptz not null default now()
);
create table public.chat_assignments (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null, assigned_by uuid references public.employees(id) on delete set null,
  assigned_at timestamptz not null default now(), unassigned_at timestamptz
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null, entity_id uuid not null, requested_by uuid references public.profiles(id) on delete set null,
  status public.approval_status not null default 'draft', submitted_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.approval_steps (
  id uuid primary key default gen_random_uuid(), approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  step_number integer not null, approver_id uuid references public.employees(id) on delete set null, decision public.approval_status not null default 'draft',
  note text, decided_at timestamptz, unique (approval_request_id, step_number)
);
create table public.document_links (
  document_id uuid not null references public.documents(id) on delete cascade, entity_type text not null, entity_id uuid not null,
  created_at timestamptz not null default now(), primary key (document_id, entity_type, entity_id)
);
create table public.vendors (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade, name text not null, email text, phone text,
  address text, status public.record_status not null default 'active', metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.expenses add column vendor_id uuid references public.vendors(id) on delete set null;
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null, description text, starts_at timestamptz not null, ends_at timestamptz not null, all_day boolean not null default false,
  project_id uuid references public.projects(id) on delete set null, owner_id uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (ends_at >= starts_at)
);

do $$
declare r record;
begin
  for r in
    select c.oid, n.nspname, rel.relname, string_agg(quote_ident(a.attname), ', ' order by u.ordinality) as columns
    from pg_constraint c join pg_class rel on rel.oid = c.conrelid join pg_namespace n on n.oid = rel.relnamespace
    join unnest(c.conkey) with ordinality u(attnum, ordinality) on true join pg_attribute a on a.attrelid = rel.oid and a.attnum = u.attnum
    where c.contype = 'f' and n.nspname = 'public' and not exists (
      select 1 from pg_index i where i.indrelid = c.conrelid and i.indisvalid and (i.indkey::smallint[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
    ) group by c.oid, n.nspname, rel.relname
  loop execute format('create index if not exists %I on %I.%I (%s)', 'betanor_fk_' || r.oid || '_idx', r.nspname, r.relname, r.columns); end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array['positions','opportunities','chat_conversations','chat_messages','chat_assignments','approval_requests','approval_steps','document_links','vendors','calendar_events'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('create policy %I on public.%I for all to anon, authenticated using (false) with check (false)', 'deny_direct_client_access', table_name);
  end loop;
end $$;
