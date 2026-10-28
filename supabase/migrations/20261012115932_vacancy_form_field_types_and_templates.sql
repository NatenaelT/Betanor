-- Full data-only vacancy form types plus reusable, workspace-scoped vacancy templates.

create table if not exists public.job_opening_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  notes text,
  default_title text,
  department_id uuid references public.departments(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  employment_type text not null default 'full_time' check (employment_type in ('full_time', 'part_time', 'contract', 'internship')),
  workplace text not null default 'Addis Ababa, Ethiopia',
  salary_min numeric(14,2),
  salary_max numeric(14,2),
  description text,
  requirements text,
  application_instructions text,
  application_form_schema jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_opening_templates_salary_check check (salary_min is null or salary_max is null or salary_max >= salary_min),
  constraint job_opening_templates_schema_check check (jsonb_typeof(application_form_schema) = 'array' and jsonb_array_length(application_form_schema) <= 25)
);

create unique index if not exists job_opening_templates_workspace_name_idx on public.job_opening_templates (workspace_id, lower(name));
create index if not exists job_opening_templates_workspace_created_idx on public.job_opening_templates (workspace_id, created_at desc);
create index if not exists job_opening_templates_department_idx on public.job_opening_templates (department_id) where department_id is not null;
create index if not exists job_opening_templates_position_idx on public.job_opening_templates (position_id) where position_id is not null;

alter table public.job_opening_templates enable row level security;
revoke all on public.job_opening_templates from anon;
grant select, insert, update, delete on public.job_opening_templates to authenticated;
drop policy if exists "HR reads vacancy templates" on public.job_opening_templates;
create policy "HR reads vacancy templates" on public.job_opening_templates for select to authenticated using ((select private.has_permission('recruitment.manage', workspace_id)));
drop policy if exists "HR creates vacancy templates" on public.job_opening_templates;
create policy "HR creates vacancy templates" on public.job_opening_templates for insert to authenticated with check ((select private.has_permission('recruitment.manage', workspace_id)));
drop policy if exists "HR updates vacancy templates" on public.job_opening_templates;
create policy "HR updates vacancy templates" on public.job_opening_templates for update to authenticated using ((select private.has_permission('recruitment.manage', workspace_id))) with check ((select private.has_permission('recruitment.manage', workspace_id)));
drop policy if exists "HR deletes vacancy templates" on public.job_opening_templates;
create policy "HR deletes vacancy templates" on public.job_opening_templates for delete to authenticated using ((select private.has_permission('recruitment.manage', workspace_id)));

create or replace function private.validate_job_opening_template_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.department_id is not null and not exists (
    select 1 from public.departments department where department.id = new.department_id and department.workspace_id = new.workspace_id
  ) then raise exception 'Template department must belong to its workspace.' using errcode = '23514'; end if;
  if new.position_id is not null and not exists (
    select 1 from public.positions position where position.id = new.position_id and position.workspace_id = new.workspace_id
      and (new.department_id is null or position.department_id is null or position.department_id = new.department_id)
  ) then raise exception 'Template position must belong to the selected workspace and department.' using errcode = '23514'; end if;
  return new;
end;
$$;
revoke all on function private.validate_job_opening_template_links() from public, anon, authenticated;
drop trigger if exists validate_job_opening_template_links_before_write on public.job_opening_templates;
create trigger validate_job_opening_template_links_before_write before insert or update of workspace_id, department_id, position_id on public.job_opening_templates
  for each row execute procedure private.validate_job_opening_template_links();
drop trigger if exists job_opening_templates_updated_at on public.job_opening_templates;
create trigger job_opening_templates_updated_at before update on public.job_opening_templates for each row execute procedure private.touch_public_content();

-- Add optional, workspace-protected custom attachments to the existing private applicant bucket.
drop policy if exists candidate_intake_upload on storage.objects;
create policy candidate_intake_upload on storage.objects for insert to anon, authenticated with check (
  bucket_id = 'betanor-candidate-documents'
  and name ~ '^intake/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(resume|cover-letter|attachment-[a-z][a-z0-9_]{0,39})\.(pdf|doc|docx)$'
);

create or replace function private.candidate_intake_document_is_unlinked(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.candidates candidate where candidate.resume_path = object_name or candidate.cover_letter_path = object_name
  ) and not exists (
    select 1 from public.job_applications application
    cross join lateral jsonb_each_text(coalesce(application.form_responses, '{}'::jsonb)) answer
    where answer.value = object_name
  );
$$;
revoke all on function private.candidate_intake_document_is_unlinked(text) from public, anon, authenticated;
grant execute on function private.candidate_intake_document_is_unlinked(text) to anon, authenticated;

drop policy if exists candidate_intake_cleanup on storage.objects;
create policy candidate_intake_cleanup on storage.objects for delete to anon, authenticated using (
  bucket_id = 'betanor-candidate-documents'
  and name ~ '^intake/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(resume|cover-letter|attachment-[a-z][a-z0-9_]{0,39})\.(pdf|doc|docx)$'
  and (select private.candidate_intake_document_is_unlinked(objects.name))
);

drop policy if exists candidate_documents_read_hr on storage.objects;
create policy candidate_documents_read_hr on storage.objects for select to authenticated using (
  bucket_id = 'betanor-candidate-documents' and (
    exists (
      select 1 from public.candidates candidate
      where (candidate.resume_path = objects.name or candidate.cover_letter_path = objects.name)
        and (select private.has_permission('recruitment.manage', candidate.workspace_id))
    )
    or exists (
      select 1 from public.job_applications application
      join public.candidates candidate on candidate.id = application.candidate_id
      cross join lateral jsonb_each_text(coalesce(application.form_responses, '{}'::jsonb)) answer
      where answer.value = objects.name and (select private.has_permission('recruitment.manage', candidate.workspace_id))
    )
  )
);

drop policy if exists candidate_documents_delete_hr on storage.objects;
create policy candidate_documents_delete_hr on storage.objects for delete to authenticated using (
  bucket_id = 'betanor-candidate-documents' and (
    exists (
      select 1 from public.candidates candidate
      where (candidate.resume_path = objects.name or candidate.cover_letter_path = objects.name)
        and (select private.has_permission('recruitment.manage', candidate.workspace_id))
    )
    or exists (
      select 1 from public.job_applications application
      join public.candidates candidate on candidate.id = application.candidate_id
      cross join lateral jsonb_each_text(coalesce(application.form_responses, '{}'::jsonb)) answer
      where answer.value = objects.name and (select private.has_permission('recruitment.manage', candidate.workspace_id))
    )
  )
);

-- The RPC is the public intake boundary: it validates schema types, choices,
-- ranges, conditions, and uploads before storing applicant answers.
create or replace function public.submit_public_job_application(
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
  field_ordinal bigint;
  field_response jsonb;
  field_key text;
  field_type text;
  field_value text;
  condition_key text;
  condition_value text;
  field_visible boolean;
  numeric_value numeric;
  scale_min integer;
  scale_max integer;
  accepted_responses jsonb := '{}'::jsonb;
begin
  if job_opening_id_input is null
    or coalesce(length(trim(email_input)), 0) < 5
    or trim(email_input) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then raise exception 'A valid email address is required.' using errcode = '22023'; end if;

  if resume_path_input is null
    or resume_path_input !~ '^intake/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/resume\.(pdf|doc|docx)$'
    or not exists (select 1 from storage.objects file where file.bucket_id = 'betanor-candidate-documents' and file.name = resume_path_input)
  then raise exception 'Upload a valid CV or resume file before submitting.' using errcode = '22023'; end if;
  if cover_letter_path_input is not null and (
    cover_letter_path_input !~ '^intake/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cover-letter\.(pdf|doc|docx)$'
    or split_part(cover_letter_path_input, '/', 2) <> split_part(resume_path_input, '/', 2)
    or not exists (select 1 from storage.objects file where file.bucket_id = 'betanor-candidate-documents' and file.name = cover_letter_path_input)
  ) then raise exception 'The cover letter attachment is invalid. Please upload it again.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(form_responses_input, '{}'::jsonb)) <> 'object' then
    raise exception 'Application responses must be an object.' using errcode = '22023';
  end if;

  select opening.* into target_opening from public.job_openings opening
  where opening.id = job_opening_id_input and opening.status = 'active'
    and (opening.opens_on is null or opening.opens_on <= current_date)
    and (opening.closes_on is null or opening.closes_on >= current_date);
  if not found then raise exception 'This vacancy is no longer accepting applications.' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(job_opening_id_input::text), hashtext(lower(trim(email_input))));
  if exists (
    select 1 from public.job_applications application
    join public.candidates candidate on candidate.id = application.candidate_id
    where application.job_opening_id = job_opening_id_input
      and candidate.workspace_id = target_opening.workspace_id
      and lower(candidate.email) = lower(trim(email_input))
  ) then raise exception 'An application from this email for this vacancy has already been received.' using errcode = '23505'; end if;

  if exists (
    select 1 from jsonb_object_keys(coalesce(form_responses_input, '{}'::jsonb)) as keys(response_key)
    where not exists (select 1 from jsonb_array_elements(target_opening.application_form_schema) field where field ->> 'key' = response_key)
  ) then raise exception 'The application includes an unknown form field.' using errcode = '22023'; end if;

  for field_definition, field_ordinal in
    select schema_field.value, schema_field.ordinality
    from jsonb_array_elements(target_opening.application_form_schema) with ordinality as schema_field(value, ordinality)
  loop
    field_key := field_definition ->> 'key';
    field_type := field_definition ->> 'type';
    field_response := form_responses_input -> field_key;
    field_value := nullif(trim(coalesce(field_response #>> '{}', '')), '');
    field_visible := true;
    if coalesce(field_key, '') !~ '^[a-z][a-z0-9_]{0,39}$'
      or coalesce(field_definition ->> 'label', '') = ''
      or coalesce(field_type, '') not in ('short_answer', 'long_answer', 'dropdown', 'select', 'radio', 'checkboxes', 'yes_no', 'linear_scale', 'number', 'date', 'time', 'email', 'phone', 'url', 'file_upload')
    then raise exception 'The application form contains an invalid field definition.' using errcode = '22023'; end if;

    if field_type in ('dropdown', 'select', 'radio', 'checkboxes') then
      if jsonb_typeof(field_definition -> 'options') is distinct from 'array' then
        raise exception 'The application form contains an invalid choice list.' using errcode = '22023';
      end if;
      if jsonb_array_length(field_definition -> 'options') < 2 or jsonb_array_length(field_definition -> 'options') > 40 then
        raise exception 'The application form contains an invalid choice list.' using errcode = '22023';
      end if;
    end if;

    if field_definition ? 'showWhen' and jsonb_typeof(field_definition -> 'showWhen') is distinct from 'object' then
      raise exception 'The application form contains an invalid conditional rule.' using errcode = '22023';
    end if;
    if jsonb_typeof(field_definition -> 'showWhen') = 'object' then
      condition_key := field_definition -> 'showWhen' ->> 'fieldKey';
      condition_value := field_definition -> 'showWhen' ->> 'equals';
      if coalesce(condition_value, '') = '' or not exists (
        select 1 from jsonb_array_elements(target_opening.application_form_schema) with ordinality as prior_field(value, ordinality)
        where prior_field.value ->> 'key' = condition_key and prior_field.ordinality < field_ordinal
      ) then raise exception 'The application form contains an invalid conditional rule.' using errcode = '22023'; end if;
      if jsonb_typeof(accepted_responses -> condition_key) = 'array' then
        field_visible := exists (
          select 1 from jsonb_array_elements_text(accepted_responses -> condition_key) answer(value)
          where answer.value = condition_value
        );
      else
        field_visible := coalesce(accepted_responses ->> condition_key, '') = coalesce(condition_value, '');
      end if;
    end if;
    if not field_visible or field_response is null or field_response = 'null'::jsonb or field_response = '""'::jsonb or field_response = '[]'::jsonb then continue; end if;

    if field_type = 'checkboxes' then
      if jsonb_typeof(field_response) is distinct from 'array' then
        raise exception 'Choose valid listed answers for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023';
      end if;
      if jsonb_array_length(field_response) > 40
        or exists (select 1 from jsonb_array_elements(field_response) as answer(value) where jsonb_typeof(answer.value) <> 'string')
        or exists (
          select 1 from jsonb_array_elements_text(field_response) answer(value)
          where not exists (select 1 from jsonb_array_elements_text(coalesce(field_definition -> 'options', '[]'::jsonb)) as option_item(value) where option_item.value = answer.value)
        )
        or (select count(*) from jsonb_array_elements_text(field_response)) <> (select count(distinct answer_value) from jsonb_array_elements_text(field_response) as selected(answer_value))
      then raise exception 'Choose valid listed answers for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
      accepted_responses := accepted_responses || jsonb_build_object(field_key, field_response);
      continue;
    end if;

    if jsonb_typeof(field_response) not in ('string', 'number') then
      raise exception 'The response for % must be a single answer.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023';
    end if;
    if length(field_value) > 5000 then raise exception 'The response for % is too long.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
    if field_type in ('dropdown', 'select', 'radio') and not exists (
      select 1 from jsonb_array_elements_text(coalesce(field_definition -> 'options', '[]'::jsonb)) as option_item(value) where option_item.value = field_value
    ) then raise exception 'Choose one of the listed options for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
    if field_type = 'yes_no' and field_value not in ('yes', 'no') then raise exception 'Choose Yes or No for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
    if field_type = 'short_answer' and length(field_value) > 1000 then raise exception 'The response for % is too long.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
    if field_type = 'email' and (length(field_value) > 254 or field_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Enter a valid email address for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
    if field_type = 'phone' and (length(field_value) > 40 or field_value !~ '^[+0-9() .-]{3,40}$') then raise exception 'Enter a valid phone number for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
    if field_type = 'url' and (length(field_value) > 500 or field_value !~* '^https?://[^[:space:]]+$') then raise exception 'Enter a valid website URL for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
    if field_type = 'linear_scale' then
      if field_value !~ '^[0-9]{1,2}$' then raise exception 'Choose a valid scale answer for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
      scale_min := coalesce((field_definition ->> 'scaleMin')::integer, 1);
      scale_max := coalesce((field_definition ->> 'scaleMax')::integer, 5);
      if scale_min < 0 or scale_max > 10 or scale_max <= scale_min or field_value::integer < scale_min or field_value::integer > scale_max then raise exception 'Choose a valid scale answer for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
    end if;
    if field_type = 'number' then
      begin numeric_value := field_value::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Enter a valid number for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end;
      if (field_definition ? 'numberMin' and numeric_value < (field_definition ->> 'numberMin')::numeric)
        or (field_definition ? 'numberMax' and numeric_value > (field_definition ->> 'numberMax')::numeric)
      then raise exception 'The number for % is outside the allowed range.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
    end if;
    if field_type = 'date' then
      if field_value !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Enter a valid date for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
      begin
        if field_value::date::text <> field_value then raise exception 'invalid date'; end if;
      exception when others then raise exception 'Enter a valid date for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end;
    end if;
    if field_type = 'time' and field_value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Enter a valid time for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
    if field_type = 'file_upload' then
      if field_value !~ ('^intake/' || split_part(resume_path_input, '/', 2) || '/attachment-' || field_key || '\.(pdf|doc|docx)$')
        or not exists (select 1 from storage.objects file where file.bucket_id = 'betanor-candidate-documents' and file.name = field_value)
      then raise exception 'Upload a valid attachment for %.', coalesce(field_definition ->> 'label', field_key) using errcode = '22023'; end if;
    end if;
    accepted_responses := accepted_responses || jsonb_build_object(field_key, field_value);
  end loop;

  insert into public.candidates (workspace_id, first_name, last_name, email, phone, resume_path, cover_letter_path, source, status)
  values (target_opening.workspace_id, nullif(trim(coalesce(first_name_input, '')), ''), nullif(trim(coalesce(last_name_input, '')), ''), lower(trim(email_input)), nullif(trim(coalesce(phone_input, '')), ''), resume_path_input, cover_letter_path_input, 'careers', 'submitted')
  returning id into target_candidate_id;
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
