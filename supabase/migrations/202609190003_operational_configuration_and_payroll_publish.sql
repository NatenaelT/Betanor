-- Operational configuration, payroll publication controls, and finance defaults.
-- All settings are workspace-scoped and inherit the existing settings.manage RLS.

create table if not exists public.workspace_letter_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  reference_prefix text not null default 'BTNR/LET',
  default_letter_type text not null default 'General Letter',
  default_salutation text not null default 'Dear Sir/Madam,',
  default_closing text not null default 'Yours faithfully,',
  default_signatory text,
  default_signatory_title text,
  registration_stamp_path text,
  letterhead_path text,
  footer_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.letter_signatories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  title text,
  signature_path text,
  stamp_path text,
  registration_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, display_name)
);
create index if not exists letter_signatories_workspace_active_idx on public.letter_signatories(workspace_id, is_active);

create table if not exists public.workspace_payroll_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  pay_frequency text not null default 'monthly' check (pay_frequency in ('monthly','biweekly','weekly')),
  payment_day integer not null default 30 check (payment_day between 1 and 31),
  hours_per_day numeric(4,2) not null default 8 check (hours_per_day > 0 and hours_per_day <= 24),
  working_days_per_week integer not null default 5 check (working_days_per_week between 1 and 7),
  pension_employee_rate numeric(7,4) not null default 0 check (pension_employee_rate between 0 and 100),
  pension_employer_rate numeric(7,4) not null default 0 check (pension_employer_rate between 0 and 100),
  default_email_payslips boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_finance_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  default_vat_rate numeric(7,4) not null default 15 check (default_vat_rate between 0 and 100),
  default_payment_terms_days integer not null default 30 check (default_payment_terms_days between 0 and 365),
  fiscal_year_start_month integer not null default 7 check (fiscal_year_start_month between 1 and 12),
  fiscal_year_start_day integer not null default 1 check (fiscal_year_start_day between 1 and 31),
  expense_approval_threshold numeric(14,2) not null default 0 check (expense_approval_threshold >= 0),
  invoice_approval_threshold numeric(14,2) not null default 0 check (invoice_approval_threshold >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.payroll_cycles add column if not exists published_at timestamptz;
alter table public.payroll_cycles add column if not exists published_by uuid references public.profiles(id) on delete set null;
alter table public.payroll_cycles add column if not exists email_dispatched_at timestamptz;
alter table public.payroll_cycles add column if not exists publication_notes text;
alter table public.payslips add column if not exists published_at timestamptz;
alter table public.payslips add column if not exists emailed_at timestamptz;
create index if not exists payroll_cycles_workspace_period_idx on public.payroll_cycles(workspace_id, period_start desc, period_end desc);
create index if not exists payroll_cycles_published_idx on public.payroll_cycles(workspace_id, published_at);
create index if not exists payslips_employee_cycle_idx on public.payslips(employee_id, payroll_cycle_id);

grant select, insert, update, delete on public.workspace_letter_settings, public.letter_signatories,
  public.workspace_payroll_settings, public.workspace_finance_settings to authenticated;
grant delete on public.payroll_cycles to authenticated;

create policy "payroll managers delete draft cycles" on public.payroll_cycles for delete to authenticated
  using ((select private.has_permission('payroll.manage', workspace_id)) and status = 'draft');

alter table public.workspace_letter_settings enable row level security;
alter table public.letter_signatories enable row level security;
alter table public.workspace_payroll_settings enable row level security;
alter table public.workspace_finance_settings enable row level security;

create policy "settings managers read letter settings" on public.workspace_letter_settings for select to authenticated
  using ((select private.has_permission('settings.manage', workspace_id)) or (select private.has_permission('letters.read', workspace_id)));
create policy "settings managers write letter settings" on public.workspace_letter_settings for all to authenticated
  using ((select private.has_permission('settings.manage', workspace_id)))
  with check ((select private.has_permission('settings.manage', workspace_id)));
create policy "letter managers read signatories" on public.letter_signatories for select to authenticated
  using ((select private.has_permission('settings.manage', workspace_id)) or (select private.has_permission('letters.read', workspace_id)));
create policy "settings managers write signatories" on public.letter_signatories for all to authenticated
  using ((select private.has_permission('settings.manage', workspace_id)))
  with check ((select private.has_permission('settings.manage', workspace_id)));

create policy "settings managers read payroll settings" on public.workspace_payroll_settings for select to authenticated
  using ((select private.has_permission('settings.manage', workspace_id)) or (select private.has_permission('payroll.manage', workspace_id)));
create policy "settings managers write payroll settings" on public.workspace_payroll_settings for all to authenticated
  using ((select private.has_permission('settings.manage', workspace_id)))
  with check ((select private.has_permission('settings.manage', workspace_id)));
create policy "settings managers read finance settings" on public.workspace_finance_settings for select to authenticated
  using ((select private.has_permission('settings.manage', workspace_id)) or (select private.has_permission('finance.read', workspace_id)) or (select private.has_permission('finance.create', workspace_id)));
create policy "settings managers write finance settings" on public.workspace_finance_settings for all to authenticated
  using ((select private.has_permission('settings.manage', workspace_id)))
  with check ((select private.has_permission('settings.manage', workspace_id)));

-- Publish is a distinct controlled action, while the existing approval_status
-- enum remains compatible with all current records and policies.
create or replace function public.publish_payroll_cycle(p_cycle_id uuid, p_notes text default null)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target public.payroll_cycles%rowtype;
  actor uuid := auth.uid();
begin
  select * into target from public.payroll_cycles where id = p_cycle_id for update;
  if target.id is null or not private.has_permission('payroll.manage', target.workspace_id) then
    raise exception 'Not authorized to publish this payroll cycle.' using errcode = '42501';
  end if;
  if target.status <> 'approved' or target.published_at is not null then
    raise exception 'Only an approved, unpublished payroll cycle can be published.' using errcode = '22023';
  end if;
  update public.payroll_cycles set published_at = now(), published_by = actor, email_dispatched_at = now(), publication_notes = nullif(trim(p_notes), '') where id = p_cycle_id;
  update public.payslips set published_at = now(), emailed_at = now(), status = 'approved' where payroll_cycle_id = p_cycle_id;
  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  select employee.profile_id, 'payslip.published', 'Payslip published', 'Your payslip is available in the Betanor staff workspace.', 'payroll_cycle', p_cycle_id
  from public.payslips slip join public.employees employee on employee.id = slip.employee_id
  where slip.payroll_cycle_id = p_cycle_id and employee.profile_id is not null;
  insert into public.audit_events (workspace_id, actor_id, entity_type, entity_id, action, payload)
  values (target.workspace_id, actor, 'payroll_cycle', p_cycle_id, 'published', jsonb_build_object('published_at', now(), 'email_dispatch', 'queued'));
  return true;
end;
$$;
grant execute on function public.publish_payroll_cycle(uuid, text) to authenticated;

-- Configuration attachments share the private letters bucket but use a separate
-- config/<workspace-id>/ namespace and the settings permission.
drop policy if exists letters_config_read on storage.objects;
create policy letters_config_read on storage.objects for select to authenticated
  using (bucket_id = 'betanor-letters' and name ~ '^config/[0-9a-f-]{36}/' and (select private.has_permission('settings.manage', split_part(name, '/', 2)::uuid)));
drop policy if exists letters_config_insert on storage.objects;
create policy letters_config_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'betanor-letters' and name ~ '^config/[0-9a-f-]{36}/' and (select private.has_permission('settings.manage', split_part(name, '/', 2)::uuid)));
drop policy if exists letters_config_update on storage.objects;
create policy letters_config_update on storage.objects for update to authenticated
  using (bucket_id = 'betanor-letters' and name ~ '^config/[0-9a-f-]{36}/' and (select private.has_permission('settings.manage', split_part(name, '/', 2)::uuid)))
  with check (bucket_id = 'betanor-letters' and name ~ '^config/[0-9a-f-]{36}/' and (select private.has_permission('settings.manage', split_part(name, '/', 2)::uuid)));
drop policy if exists letters_config_delete on storage.objects;
create policy letters_config_delete on storage.objects for delete to authenticated
  using (bucket_id = 'betanor-letters' and name ~ '^config/[0-9a-f-]{36}/' and (select private.has_permission('settings.manage', split_part(name, '/', 2)::uuid)));
