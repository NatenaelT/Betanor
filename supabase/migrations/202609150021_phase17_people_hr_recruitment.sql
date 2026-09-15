-- People module: employee profiles, Ethiopian workweek rules, leave approvals,
-- and public recruitment intake with HR-only review access.

create sequence if not exists public.employee_number_seq;

create or replace function public.assign_employee_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(trim(new.employee_number), '') = '' then
    new.employee_number := format('BTNR-EMP-%s-%s', to_char(current_date, 'YYYY'), lpad(nextval('public.employee_number_seq')::text, 5, '0'));
  end if;
  return new;
end;
$$;

revoke all on function public.assign_employee_number() from public, anon, authenticated;
drop trigger if exists assign_employee_number_before_insert on public.employees;
create trigger assign_employee_number_before_insert
  before insert on public.employees
  for each row execute procedure public.assign_employee_number();

alter table public.employees
  alter column employee_number drop not null,
  add column if not exists employment_type text not null default 'full_time',
  add column if not exists work_hours_per_day numeric(4,2) not null default 8,
  add column if not exists work_days_per_week integer not null default 5,
  add column if not exists probation_end_date date;
alter table public.employees alter column employee_number set not null;
alter table public.employees drop constraint if exists employees_standard_workweek_check;
alter table public.employees add constraint employees_standard_workweek_check check (work_hours_per_day = 8 and work_days_per_week = 5);

alter table public.candidates
  add column if not exists cover_letter text,
  add column if not exists education text,
  add column if not exists years_experience numeric(5,2);

alter table public.job_openings
  add column if not exists requirements text,
  add column if not exists employment_type text not null default 'full_time',
  add column if not exists workplace text not null default 'Addis Ababa, Ethiopia',
  add column if not exists salary_min numeric(14,2),
  add column if not exists salary_max numeric(14,2),
  add column if not exists application_instructions text;

alter table public.job_applications
  add column if not exists score numeric(5,2),
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.leave_requests
  add column if not exists manager_approved_by uuid references public.employees(id) on delete set null,
  add column if not exists manager_approved_at timestamptz,
  add column if not exists hr_approved_by uuid references public.employees(id) on delete set null,
  add column if not exists hr_approved_at timestamptz,
  add column if not exists approval_note text;

create or replace function private.business_days_between(start_date date, end_date date)
returns numeric
language sql
immutable
security definer
set search_path = ''
as $$
  select count(*)::numeric
  from generate_series(start_date, end_date, interval '1 day') as day_value
  where extract(isodow from day_value) between 1 and 5;
$$;
revoke all on function private.business_days_between(date, date) from public, anon, authenticated;
grant execute on function private.business_days_between(date, date) to authenticated;

create or replace function public.set_leave_business_days()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.duration_days := private.business_days_between(new.starts_on, new.ends_on);
  if new.duration_days <= 0 then
    raise exception 'Leave must include at least one Monday-to-Friday working day.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.set_leave_business_days() from public, anon, authenticated;
drop trigger if exists set_leave_business_days_before_write on public.leave_requests;
create trigger set_leave_business_days_before_write
  before insert or update of starts_on, ends_on on public.leave_requests
  for each row execute procedure public.set_leave_business_days();

create or replace function private.leave_request_is_manager(target_leave_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.leave_requests request
    join public.employees employee on employee.id = request.employee_id
    join public.employees manager on manager.id = employee.manager_id
    where request.id = target_leave_request_id
      and manager.profile_id = (select auth.uid())
  );
$$;
revoke all on function private.leave_request_is_manager(uuid) from public, anon;
grant execute on function private.leave_request_is_manager(uuid) to authenticated;

-- Employee records and contracts: HR manages the full record; employees can read only themselves.
grant select, insert, update on public.employees to authenticated;
create policy "hr staff create employees" on public.employees for insert to authenticated
  with check ((select private.has_permission('hr.manage', workspace_id)));
create policy "hr staff update employees" on public.employees for update to authenticated
  using ((select private.has_permission('hr.manage', workspace_id)))
  with check ((select private.has_permission('hr.manage', workspace_id)));

grant select, insert, update on public.employment_contracts to authenticated;
create policy "staff read employment contracts" on public.employment_contracts for select to authenticated
  using ((select private.owns_employee(employee_id)) or exists (select 1 from public.employees employee where employee.id = employment_contracts.employee_id and ((select private.has_permission('hr.read', employee.workspace_id)) or (select private.has_permission('hr.manage', employee.workspace_id)))));
create policy "hr manage employment contracts" on public.employment_contracts for insert to authenticated
  with check (exists (select 1 from public.employees employee where employee.id = employment_contracts.employee_id and (select private.has_permission('hr.manage', employee.workspace_id))));
create policy "hr update employment contracts" on public.employment_contracts for update to authenticated
  using (exists (select 1 from public.employees employee where employee.id = employment_contracts.employee_id and (select private.has_permission('hr.manage', employee.workspace_id))))
  with check (exists (select 1 from public.employees employee where employee.id = employment_contracts.employee_id and (select private.has_permission('hr.manage', employee.workspace_id))));

grant select on public.departments to authenticated;
create policy "hr staff read departments" on public.departments for select to authenticated
  using ((select private.has_permission('hr.read', workspace_id)) or (select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)));
grant select, insert, update on public.positions to authenticated;
create policy "hr staff read positions" on public.positions for select to authenticated
  using ((select private.has_permission('hr.read', workspace_id)) or (select private.has_permission('hr.manage', workspace_id)));
create policy "hr staff manage positions" on public.positions for insert to authenticated
  with check ((select private.has_permission('hr.manage', workspace_id)));
create policy "hr staff update positions" on public.positions for update to authenticated
  using ((select private.has_permission('hr.manage', workspace_id)))
  with check ((select private.has_permission('hr.manage', workspace_id)));

-- Recruitment publishing and review.
grant select on public.job_openings to anon, authenticated;
grant insert, update, delete on public.job_openings to authenticated;
create policy "public read active job openings" on public.job_openings for select to anon, authenticated
  using (status = 'active' and (opens_on is null or opens_on <= current_date) and (closes_on is null or closes_on >= current_date));
create policy "hr read all job openings" on public.job_openings for select to authenticated
  using ((select private.has_permission('recruitment.manage', workspace_id)));
create policy "hr create job openings" on public.job_openings for insert to authenticated
  with check ((select private.has_permission('recruitment.manage', workspace_id)));
create policy "hr update job openings" on public.job_openings for update to authenticated
  using ((select private.has_permission('recruitment.manage', workspace_id)))
  with check ((select private.has_permission('recruitment.manage', workspace_id)));
create policy "hr delete job openings" on public.job_openings for delete to authenticated
  using ((select private.has_permission('recruitment.manage', workspace_id)));

grant select, update on public.candidates to authenticated;
grant select, update on public.job_applications to authenticated;
create policy "hr read candidates" on public.candidates for select to authenticated
  using ((select private.has_permission('recruitment.manage', workspace_id)));
create policy "hr update candidates" on public.candidates for update to authenticated
  using ((select private.has_permission('recruitment.manage', workspace_id)))
  with check ((select private.has_permission('recruitment.manage', workspace_id)));
create policy "hr read applications" on public.job_applications for select to authenticated
  using (exists (select 1 from public.job_openings opening where opening.id = job_applications.job_opening_id and (select private.has_permission('recruitment.manage', opening.workspace_id))));
create policy "hr update applications" on public.job_applications for update to authenticated
  using (exists (select 1 from public.job_openings opening where opening.id = job_applications.job_opening_id and (select private.has_permission('recruitment.manage', opening.workspace_id))))
  with check (exists (select 1 from public.job_openings opening where opening.id = job_applications.job_opening_id and (select private.has_permission('recruitment.manage', opening.workspace_id))));

create or replace function public.submit_public_job_application(
  job_opening_id_input uuid,
  first_name_input text,
  last_name_input text,
  email_input text,
  phone_input text,
  education_input text,
  years_experience_input numeric,
  cover_letter_input text,
  resume_path_input text default null
)
returns table(application_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  target_candidate_id uuid;
  target_application_id uuid;
begin
  if job_opening_id_input is null or coalesce(length(trim(first_name_input)), 0) < 2 or coalesce(length(trim(last_name_input)), 0) < 2 or coalesce(length(trim(email_input)), 0) < 5 or position('@' in email_input) = 0 or coalesce(length(trim(cover_letter_input)), 0) < 20 then
    raise exception 'Please provide your name, valid email, and a cover letter of at least 20 characters.' using errcode = '22023';
  end if;

  select workspace_id into target_workspace_id
  from public.job_openings
  where id = job_opening_id_input and status = 'active'
    and (opens_on is null or opens_on <= current_date)
    and (closes_on is null or closes_on >= current_date);
  if target_workspace_id is null then raise exception 'This vacancy is no longer accepting applications.' using errcode = 'P0001'; end if;

  insert into public.candidates (workspace_id, first_name, last_name, email, phone, resume_path, source, status, cover_letter, education, years_experience)
  values (target_workspace_id, trim(first_name_input), trim(last_name_input), lower(trim(email_input)), nullif(trim(phone_input), ''), nullif(trim(resume_path_input), ''), 'careers', 'submitted', trim(cover_letter_input), nullif(trim(education_input), ''), years_experience_input)
  returning id into target_candidate_id;

  insert into public.job_applications (job_opening_id, candidate_id, stage)
  values (job_opening_id_input, target_candidate_id, 'applied')
  returning id into target_application_id;

  return query select target_application_id;
exception when unique_violation then
  raise exception 'An application from this email for this vacancy has already been received.' using errcode = '23505';
end;
$$;
revoke all on function public.submit_public_job_application(uuid, text, text, text, text, text, numeric, text, text) from public;
grant execute on function public.submit_public_job_application(uuid, text, text, text, text, text, numeric, text, text) to anon, authenticated;

-- Enforce the two-step manager then HR approval path at the policy boundary.
drop policy if exists "authorized staff decide leave requests" on public.leave_requests;
create policy "manager and hr decide leave requests" on public.leave_requests for update to authenticated
  using ((select private.has_permission('leave.approve', private.leave_request_workspace(id)))
    and status in ('submitted', 'in_review')
    and ((select private.leave_request_is_manager(id)) or (select private.has_permission('hr.manage', private.leave_request_workspace(id)))))
  with check ((select private.has_permission('leave.approve', private.leave_request_workspace(id)))
    and status in ('in_review', 'approved', 'rejected')
    and ((select private.leave_request_is_manager(id)) or (select private.has_permission('hr.manage', private.leave_request_workspace(id)))));

create index if not exists employees_workspace_status_idx on public.employees(workspace_id, employment_status);
create index if not exists employment_contracts_employee_status_idx on public.employment_contracts(employee_id, status, starts_on desc);
create index if not exists job_openings_workspace_status_dates_idx on public.job_openings(workspace_id, status, opens_on, closes_on);
create index if not exists job_applications_opening_stage_idx on public.job_applications(job_opening_id, stage);
create index if not exists leave_requests_employee_dates_idx on public.leave_requests(employee_id, starts_on, ends_on);
