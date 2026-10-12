-- Recruitment improvements: configurable application forms, protected documents,
-- separate shortlist/interview queues, and automatic employee creation on hire.

alter table public.candidates
  alter column first_name drop not null,
  alter column last_name drop not null,
  add column if not exists cover_letter_path text;

alter table public.job_openings
  add column if not exists position_id uuid references public.positions(id) on delete set null,
  add column if not exists application_form_schema jsonb not null default '[]'::jsonb;

alter table public.job_openings
  drop constraint if exists job_openings_application_form_schema_check;
alter table public.job_openings
  add constraint job_openings_application_form_schema_check
  check (jsonb_typeof(application_form_schema) = 'array' and jsonb_array_length(application_form_schema) <= 25);

alter table public.job_applications
  add column if not exists form_responses jsonb not null default '{}'::jsonb,
  add column if not exists interview_at timestamptz,
  add column if not exists interview_location text,
  add column if not exists interview_notes text;

create index if not exists job_applications_interview_queue_idx
  on public.job_applications (stage, interview_at, applied_at desc)
  where stage in ('shortlisted', 'interview');
create index if not exists job_applications_hired_employee_idx
  on public.job_applications (hired_employee_id)
  where hired_employee_id is not null;

grant delete on public.candidates to authenticated;
create or replace function private.candidate_has_applications(candidate_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.job_applications application where application.candidate_id = candidate_id_input);
$$;
revoke all on function private.candidate_has_applications(uuid) from public;
grant execute on function private.candidate_has_applications(uuid) to authenticated;
drop policy if exists "hr delete unlinked candidates" on public.candidates;
create policy "hr delete unlinked candidates" on public.candidates for delete to authenticated
  using (
    (select private.has_permission('recruitment.manage', workspace_id))
    and not (select private.candidate_has_applications(candidates.id))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'betanor-candidate-documents',
  'betanor-candidate-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

grant select, insert, delete on storage.objects to anon, authenticated;

create or replace function private.candidate_intake_document_is_unlinked(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.candidates candidate
    where candidate.resume_path = object_name or candidate.cover_letter_path = object_name
  );
$$;
revoke all on function private.candidate_intake_document_is_unlinked(text) from public;
grant execute on function private.candidate_intake_document_is_unlinked(text) to anon, authenticated;

drop policy if exists candidate_intake_upload on storage.objects;
create policy candidate_intake_upload on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'betanor-candidate-documents'
    and name ~ '^intake/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(resume|cover-letter)\.(pdf|doc|docx)$'
  );

-- Public applicants can clean up only their own unlinked, unguessable intake paths
-- when submission fails. No public read, update, or list policy is created.
drop policy if exists candidate_intake_cleanup on storage.objects;
create policy candidate_intake_cleanup on storage.objects
  for delete to anon, authenticated
  using (
    bucket_id = 'betanor-candidate-documents'
    and name ~ '^intake/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(resume|cover-letter)\.(pdf|doc|docx)$'
    and (select private.candidate_intake_document_is_unlinked(objects.name))
  );

drop policy if exists candidate_documents_read_hr on storage.objects;
create policy candidate_documents_read_hr on storage.objects
  for select to authenticated
  using (
    bucket_id = 'betanor-candidate-documents'
    and exists (
      select 1
      from public.candidates candidate
      where (candidate.resume_path = objects.name or candidate.cover_letter_path = objects.name)
        and (select private.has_permission('recruitment.manage', candidate.workspace_id))
    )
  );

drop policy if exists candidate_documents_delete_hr on storage.objects;
create policy candidate_documents_delete_hr on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'betanor-candidate-documents'
    and exists (
      select 1
      from public.candidates candidate
      where (candidate.resume_path = objects.name or candidate.cover_letter_path = objects.name)
        and (select private.has_permission('recruitment.manage', candidate.workspace_id))
    )
  );

drop function if exists public.submit_public_job_application(uuid, text, text, text, text, text, numeric, text, text);

create function public.submit_public_job_application(
  job_opening_id_input uuid,
  first_name_input text,
  last_name_input text,
  email_input text,
  phone_input text,
  form_responses_input jsonb,
  resume_path_input text,
  cover_letter_path_input text
)
returns table(application_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_opening public.job_openings%rowtype;
  target_candidate_id uuid;
  target_application_id uuid;
  field_definition jsonb;
  field_key text;
  field_type text;
  field_value text;
  condition_key text;
  condition_value text;
  field_visible boolean;
  accepted_responses jsonb := '{}'::jsonb;
begin
  if job_opening_id_input is null
    or coalesce(length(trim(email_input)), 0) < 5
    or trim(email_input) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'A valid email address is required.' using errcode = '22023';
  end if;

  if resume_path_input is null
    or resume_path_input !~ '^intake/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/resume\.(pdf|doc|docx)$'
    or not exists (
      select 1 from storage.objects file
      where file.bucket_id = 'betanor-candidate-documents' and file.name = resume_path_input
    )
  then
    raise exception 'Upload a valid CV or resume file before submitting.' using errcode = '22023';
  end if;

  if cover_letter_path_input is not null and (
    cover_letter_path_input !~ '^intake/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover-letter\.(pdf|doc|docx)$'
    or not exists (
      select 1 from storage.objects file
      where file.bucket_id = 'betanor-candidate-documents' and file.name = cover_letter_path_input
    )
  ) then
    raise exception 'The cover letter attachment is invalid. Please upload it again.' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(form_responses_input, '{}'::jsonb)) <> 'object' then
    raise exception 'Application responses must be an object.' using errcode = '22023';
  end if;

  select opening.* into target_opening
  from public.job_openings opening
  where opening.id = job_opening_id_input
    and opening.status = 'active'
    and (opening.opens_on is null or opening.opens_on <= current_date)
    and (opening.closes_on is null or opening.closes_on >= current_date);

  if not found then
    raise exception 'This vacancy is no longer accepting applications.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(job_opening_id_input::text), hashtext(lower(trim(email_input))));
  if exists (
    select 1
    from public.job_applications application
    join public.candidates candidate on candidate.id = application.candidate_id
    where application.job_opening_id = job_opening_id_input
      and candidate.workspace_id = target_opening.workspace_id
      and lower(candidate.email) = lower(trim(email_input))
  ) then
    raise exception 'An application from this email for this vacancy has already been received.' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(coalesce(form_responses_input, '{}'::jsonb)) as keys(response_key)
    where not exists (
      select 1
      from jsonb_array_elements(target_opening.application_form_schema) field
      where field ->> 'key' = response_key
    )
  ) then
    raise exception 'The application includes an unknown form field.' using errcode = '22023';
  end if;

  for field_definition in
    select value from jsonb_array_elements(target_opening.application_form_schema)
  loop
    field_key := field_definition ->> 'key';
    field_type := field_definition ->> 'type';
    field_value := nullif(trim(coalesce(form_responses_input ->> field_key, '')), '');
    field_visible := true;

    if coalesce(field_key, '') !~ '^[a-z][a-z0-9_]{1,39}$'
      or coalesce(field_definition ->> 'label', '') = ''
      or coalesce(field_type, '') not in ('select', 'yes_no')
    then
      raise exception 'The application form contains an invalid field definition.' using errcode = '22023';
    end if;

    if jsonb_typeof(field_definition -> 'showWhen') = 'object' then
      condition_key := field_definition -> 'showWhen' ->> 'fieldKey';
      condition_value := field_definition -> 'showWhen' ->> 'equals';
      field_visible := coalesce(form_responses_input ->> condition_key, '') = coalesce(condition_value, '');
    end if;

    if field_visible and field_value is not null and field_type = 'select'
      and not exists (
        select 1 from jsonb_array_elements_text(coalesce(field_definition -> 'options', '[]'::jsonb)) option_value
        where option_value = field_value
      )
    then
      raise exception 'Choose one of the listed options for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023';
    end if;

    if field_visible and field_value is not null and field_type = 'yes_no' and field_value not in ('yes', 'no') then
      raise exception 'Choose Yes or No for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023';
    end if;

    if field_visible and field_value is not null and length(field_value) > 2000 then
      raise exception 'The response for % is too long.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023';
    end if;

    if field_visible and field_value is not null then
      accepted_responses := accepted_responses || jsonb_build_object(field_key, field_value);
    end if;
  end loop;

  insert into public.candidates (
    workspace_id, first_name, last_name, email, phone, resume_path,
    cover_letter_path, source, status
  ) values (
    target_opening.workspace_id,
    nullif(trim(coalesce(first_name_input, '')), ''),
    nullif(trim(coalesce(last_name_input, '')), ''),
    lower(trim(email_input)),
    nullif(trim(coalesce(phone_input, '')), ''),
    resume_path_input,
    cover_letter_path_input,
    'careers',
    'submitted'
  ) returning id into target_candidate_id;

  insert into public.job_applications (job_opening_id, candidate_id, stage, form_responses)
  values (job_opening_id_input, target_candidate_id, 'applied', accepted_responses)
  returning id into target_application_id;

  return query select target_application_id;
exception when unique_violation then
  raise exception 'An application from this email for this vacancy has already been received.' using errcode = '23505';
end;
$$;

revoke all on function public.submit_public_job_application(uuid, text, text, text, text, jsonb, text, text) from public;
grant execute on function public.submit_public_job_application(uuid, text, text, text, text, jsonb, text, text) to anon, authenticated;

create or replace function private.create_employee_for_hired_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_opening public.job_openings%rowtype;
  target_candidate public.candidates%rowtype;
  existing_employee_id uuid;
begin
  if old.stage = 'hired' then
    if new.stage is distinct from old.stage or new.hired_employee_id is distinct from old.hired_employee_id then
      raise exception 'A hired application cannot be reverted or relinked. Update the employee record instead.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.stage <> 'hired' then
    if new.hired_employee_id is distinct from old.hired_employee_id then
      raise exception 'Employee links are assigned only by the hiring workflow.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Never trust a caller-supplied employee link; resolve or create it below.
  new.hired_employee_id := null;

  select opening.* into target_opening
  from public.job_openings opening
  where opening.id = new.job_opening_id;
  if not found then
    raise exception 'The vacancy for this application no longer exists.' using errcode = '23503';
  end if;

  if (select auth.uid()) is not null
    and not (select private.has_permission('recruitment.manage', target_opening.workspace_id))
  then
    raise exception 'Recruitment permission is required to hire a candidate.' using errcode = '42501';
  end if;

  select candidate.* into target_candidate
  from public.candidates candidate
  where candidate.id = new.candidate_id;
  if nullif(trim(coalesce(target_candidate.first_name, '')), '') is null
    or nullif(trim(coalesce(target_candidate.last_name, '')), '') is null
  then
    raise exception 'Enter the candidate first and last name before marking the application Hired.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(target_candidate.email, '')), '') is not null then
    select employee.id into existing_employee_id
    from public.employees employee
    where employee.workspace_id = target_opening.workspace_id
      and lower(employee.work_email) = lower(target_candidate.email)
    order by employee.created_at
    limit 1;
  end if;

  if existing_employee_id is not null then
    new.hired_employee_id := existing_employee_id;
    return new;
  end if;

  insert into public.employees (
    workspace_id, department_id, position_id, first_name, last_name,
    work_email, hire_date, employment_status, employment_type, metadata
  ) values (
    target_opening.workspace_id,
    target_opening.department_id,
    target_opening.position_id,
    trim(target_candidate.first_name),
    trim(target_candidate.last_name),
    nullif(lower(trim(coalesce(target_candidate.email, ''))), ''),
    current_date,
    'active',
    case when target_opening.employment_type in ('full_time', 'part_time', 'contract', 'internship') then target_opening.employment_type else 'full_time' end,
    jsonb_build_object('source', 'recruitment', 'job_application_id', new.id, 'job_opening_id', target_opening.id, 'candidate_id', target_candidate.id)
  ) returning id into existing_employee_id;
  new.hired_employee_id := existing_employee_id;

  return new;
end;
$$;

revoke all on function private.create_employee_for_hired_application() from public, anon, authenticated;
drop trigger if exists create_employee_for_hired_application on public.job_applications;
create trigger create_employee_for_hired_application
  before update of stage, hired_employee_id on public.job_applications
  for each row execute function private.create_employee_for_hired_application();
