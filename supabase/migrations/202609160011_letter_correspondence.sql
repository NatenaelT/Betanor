-- Letter / correspondence management.
-- This migration is deliberately isolated from the generic document register: a
-- letter is a governed business record with an immutable submitted snapshot.

create table if not exists public.letter_reference_sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period text not null,
  prefix text not null default 'BTNR/LET',
  next_number integer not null default 1 check (next_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, period, prefix)
);

create table if not exists public.letter_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  category text not null default 'General Letter',
  subject_template text,
  salutation_template text,
  body_template text not null default '<p></p>',
  closing_template text,
  signatory text,
  signatory_title text,
  allowed_placeholders text[] not null default array[
    'recipient_name', 'recipient_organization', 'reference_number',
    'letter_date', 'customer_name', 'employee_name', 'tender_reference',
    'project_name', 'quotation_number', 'contract_number'
  ],
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reference_number text not null unique,
  letter_date date not null,
  letter_type text not null default 'General Letter',
  department_id uuid references public.departments(id) on delete set null,
  prepared_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete set null,
  recipient_name text not null,
  recipient_title text,
  recipient_organization text not null,
  recipient_address text,
  recipient_email text,
  cc text,
  subject text not null,
  salutation text not null default 'Dear Sir/Madam,',
  body_html text not null,
  closing text not null default 'Yours faithfully,',
  signatory text not null,
  signatory_title text,
  internal_notes text,
  tags text[] not null default '{}',
  customer_id uuid references public.customers(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  tender_id uuid,
  project_id uuid references public.projects(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null,
  quotation_id uuid references public.quotations(id) on delete set null,
  rfq_id uuid references public.rfq_requests(id) on delete set null,
  source_letter_id uuid references public.letters(id) on delete set null,
  related_type text check (related_type is null or related_type in ('response_to', 'follow_up_to', 'correction_to', 'reference_to', 'replacement_for')),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'SUBMITTED')),
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  final_pdf_path text,
  final_pdf_hash text,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.letter_versions (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters(id) on delete cascade,
  version_number integer not null,
  version_type text not null check (version_type in ('CREATED', 'EDITED', 'PUBLISHED', 'SUBMITTED')),
  snapshot jsonb not null,
  content_hash text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (letter_id, version_number)
);

create table if not exists public.letter_attachments (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  checksum text,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

create index if not exists letters_reference_number_idx on public.letters(reference_number);
create index if not exists letters_status_idx on public.letters(workspace_id, status);
create index if not exists letters_letter_date_idx on public.letters(workspace_id, letter_date desc);
create index if not exists letters_department_idx on public.letters(workspace_id, department_id);
create index if not exists letters_prepared_by_idx on public.letters(workspace_id, prepared_by);
create index if not exists letters_created_at_idx on public.letters(workspace_id, created_at desc);
create index if not exists letters_recipient_organization_idx on public.letters(workspace_id, recipient_organization);
create index if not exists letter_versions_letter_idx on public.letter_versions(letter_id, version_number desc);
create index if not exists letter_attachments_letter_idx on public.letter_attachments(letter_id, created_at desc);

insert into public.permissions (code, module, description)
values
  ('letters.read', 'letters', 'Read own letter correspondence'),
  ('letters.create', 'letters', 'Create letter drafts'),
  ('letters.edit_own', 'letters', 'Edit own draft or published letters'),
  ('letters.edit_all', 'letters', 'Edit any draft or published letter'),
  ('letters.publish', 'letters', 'Publish letters for internal use'),
  ('letters.submit', 'letters', 'Finalize and submit official letters'),
  ('letters.download', 'letters', 'Download and print letter PDFs'),
  ('letters.archive', 'letters', 'Archive non-final letters'),
  ('letters.manage_templates', 'letters', 'Create and maintain letter templates'),
  ('letters.view_department', 'letters', 'View correspondence for the department'),
  ('letters.view_all', 'letters', 'View all workspace correspondence')
on conflict (code) do update set module = excluded.module, description = excluded.description;

with role_permissions_seed(role_code, permission_code) as (
  values
    ('SUPER_ADMIN', 'letters.read'), ('SUPER_ADMIN', 'letters.create'), ('SUPER_ADMIN', 'letters.edit_own'), ('SUPER_ADMIN', 'letters.edit_all'), ('SUPER_ADMIN', 'letters.publish'), ('SUPER_ADMIN', 'letters.submit'), ('SUPER_ADMIN', 'letters.download'), ('SUPER_ADMIN', 'letters.archive'), ('SUPER_ADMIN', 'letters.manage_templates'), ('SUPER_ADMIN', 'letters.view_department'), ('SUPER_ADMIN', 'letters.view_all'),
    ('ADMIN', 'letters.read'), ('ADMIN', 'letters.create'), ('ADMIN', 'letters.edit_own'), ('ADMIN', 'letters.edit_all'), ('ADMIN', 'letters.publish'), ('ADMIN', 'letters.download'), ('ADMIN', 'letters.view_department'),
    ('MANAGEMENT', 'letters.read'), ('MANAGEMENT', 'letters.publish'), ('MANAGEMENT', 'letters.submit'), ('MANAGEMENT', 'letters.download'), ('MANAGEMENT', 'letters.view_all'),
    ('HR_MANAGER', 'letters.read'), ('HR_MANAGER', 'letters.create'), ('HR_MANAGER', 'letters.edit_own'), ('HR_MANAGER', 'letters.publish'), ('HR_MANAGER', 'letters.download'), ('HR_MANAGER', 'letters.view_department'),
    ('HR_STAFF', 'letters.read'), ('HR_STAFF', 'letters.create'), ('HR_STAFF', 'letters.edit_own'), ('HR_STAFF', 'letters.download'), ('HR_STAFF', 'letters.view_department'),
    ('FINANCE_MANAGER', 'letters.read'), ('FINANCE_MANAGER', 'letters.create'), ('FINANCE_MANAGER', 'letters.edit_own'), ('FINANCE_MANAGER', 'letters.publish'), ('FINANCE_MANAGER', 'letters.submit'), ('FINANCE_MANAGER', 'letters.download'), ('FINANCE_MANAGER', 'letters.view_department'),
    ('FINANCE_STAFF', 'letters.read'), ('FINANCE_STAFF', 'letters.create'), ('FINANCE_STAFF', 'letters.edit_own'), ('FINANCE_STAFF', 'letters.download'), ('FINANCE_STAFF', 'letters.view_department'),
    ('SALES_MANAGER', 'letters.read'), ('SALES_MANAGER', 'letters.create'), ('SALES_MANAGER', 'letters.edit_own'), ('SALES_MANAGER', 'letters.publish'), ('SALES_MANAGER', 'letters.submit'), ('SALES_MANAGER', 'letters.download'), ('SALES_MANAGER', 'letters.view_department'),
    ('SALES_STAFF', 'letters.read'), ('SALES_STAFF', 'letters.create'), ('SALES_STAFF', 'letters.edit_own'), ('SALES_STAFF', 'letters.download'), ('SALES_STAFF', 'letters.view_department'),
    ('PROJECT_MANAGER', 'letters.read'), ('PROJECT_MANAGER', 'letters.create'), ('PROJECT_MANAGER', 'letters.edit_own'), ('PROJECT_MANAGER', 'letters.publish'), ('PROJECT_MANAGER', 'letters.download'), ('PROJECT_MANAGER', 'letters.view_department'),
    ('TEAM_LEAD', 'letters.read'), ('TEAM_LEAD', 'letters.create'), ('TEAM_LEAD', 'letters.edit_own'), ('TEAM_LEAD', 'letters.download'), ('TEAM_LEAD', 'letters.view_department'),
    ('CONTENT_EDITOR', 'letters.read'), ('CONTENT_EDITOR', 'letters.create'), ('CONTENT_EDITOR', 'letters.edit_own'), ('CONTENT_EDITOR', 'letters.download'),
    ('EMPLOYEE', 'letters.read'), ('EMPLOYEE', 'letters.create'), ('EMPLOYEE', 'letters.edit_own'), ('EMPLOYEE', 'letters.download')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from role_permissions_seed
join public.roles role on role.code = role_permissions_seed.role_code and role.workspace_id is null and role.role_type = 'staff'
join public.permissions permission on permission.code = role_permissions_seed.permission_code
on conflict do nothing;

create or replace function private.letter_workspace(target_letter_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select workspace_id from public.letters where id = target_letter_id;
$$;

create or replace function private.can_read_letter(target_workspace_id uuid, target_department_id uuid, target_prepared_by uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_permission('letters.view_all', target_workspace_id)
    or (private.has_permission('letters.view_department', target_workspace_id) and exists (
      select 1 from public.employees employee where employee.profile_id = auth.uid() and employee.workspace_id = target_workspace_id and employee.department_id = target_department_id
    ))
    or (private.has_permission('letters.read', target_workspace_id) and target_prepared_by = auth.uid());
$$;

create or replace function private.can_edit_letter(target_workspace_id uuid, target_department_id uuid, target_prepared_by uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_permission('letters.edit_all', target_workspace_id)
    or (private.has_permission('letters.edit_own', target_workspace_id) and target_prepared_by = auth.uid());
$$;

create or replace function public.allocate_letter_reference(
  p_workspace_id uuid,
  p_letter_date date,
  p_department_id uuid default null,
  p_prefix text default 'BTNR/LET'
)
returns table(reference_number text, prefix text, period text, sequence_number integer)
language plpgsql security definer set search_path = '' as $$
declare
  actor_workspace uuid;
  period_value text := to_char(coalesce(p_letter_date, current_date), 'YYYY');
  prefix_value text := coalesce(nullif(trim(p_prefix), ''), 'BTNR/LET');
  sequence_value integer;
begin
  select workspace_id into actor_workspace from public.profiles where id = auth.uid() and is_active = true;
  if p_workspace_id is null or actor_workspace is distinct from p_workspace_id or not private.has_permission('letters.create', p_workspace_id) then
    raise exception 'Not authorized to allocate a letter reference.' using errcode = '42501';
  end if;
  if prefix_value !~ '^BTNR/[A-Z0-9]+$' then
    raise exception 'Invalid letter reference prefix.' using errcode = '22023';
  end if;
  if p_department_id is not null and not exists (select 1 from public.departments where id = p_department_id and workspace_id = p_workspace_id) then
    raise exception 'The selected department does not belong to this workspace.' using errcode = '23503';
  end if;
  insert into public.letter_reference_sequences (workspace_id, period, prefix, next_number)
  values (p_workspace_id, period_value, prefix_value, 1)
  on conflict (workspace_id, period, prefix) do nothing;
  select next_number into sequence_value from public.letter_reference_sequences where workspace_id = p_workspace_id and period = period_value and prefix = prefix_value for update;
  update public.letter_reference_sequences set next_number = sequence_value + 1, updated_at = now() where workspace_id = p_workspace_id and period = period_value and prefix = prefix_value;
  return query select prefix_value || '/' || period_value || '/' || lpad(sequence_value::text, 5, '0'), prefix_value, period_value, sequence_value;
end;
$$;

create or replace function public.record_letter_audit(
  p_workspace_id uuid,
  p_letter_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_permission('letters.read', p_workspace_id) then
    raise exception 'Not authorized to record letter audit.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.letters letter where letter.id = p_letter_id and letter.workspace_id = p_workspace_id) then
    raise exception 'The letter does not belong to this workspace.' using errcode = '42501';
  end if;
  insert into public.audit_events (workspace_id, actor_id, entity_type, entity_id, action, payload)
  values (p_workspace_id, auth.uid(), 'letter', p_letter_id, p_action, coalesce(p_payload, '{}'::jsonb));
end;
$$;

create or replace function public.enqueue_letter_notification(
  p_workspace_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_entity_id uuid,
  p_recipient_ids uuid[] default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare inserted_count integer;
begin
  if auth.uid() is null or not private.has_permission('letters.read', p_workspace_id) then
    raise exception 'Not authorized to enqueue letter notification.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.letters letter where letter.id = p_entity_id and letter.workspace_id = p_workspace_id) then
    raise exception 'The letter does not belong to this workspace.' using errcode = '42501';
  end if;
  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
  select profile.id, p_type, p_title, p_body, 'letter', p_entity_id
  from public.profiles profile
  where profile.workspace_id = p_workspace_id and profile.is_active = true
    and (p_recipient_ids is null or profile.id = any(p_recipient_ids))
    and profile.id <> auth.uid()
    and exists (select 1 from public.user_roles user_role join public.roles role on role.id = user_role.role_id where user_role.user_id = profile.id and role.role_type = 'staff');
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function private.guard_letter_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'SUBMITTED' then
    raise exception 'Submitted letters are immutable.' using errcode = '55000';
  end if;
  if new.workspace_id is distinct from old.workspace_id or new.reference_number is distinct from old.reference_number or new.prepared_by is distinct from old.prepared_by then
    raise exception 'Letter tenancy, reference, and preparer are immutable.' using errcode = '55000';
  end if;
  if old.status = 'DRAFT' and new.status not in ('DRAFT', 'PUBLISHED') then
    raise exception 'A draft must be published before submission.' using errcode = '22023';
  end if;
  if old.status = 'PUBLISHED' and new.status not in ('PUBLISHED', 'SUBMITTED') then
    raise exception 'Published letters can only remain published or be submitted.' using errcode = '22023';
  end if;
  if old.status = 'DRAFT' and new.status = 'PUBLISHED' and not private.has_permission('letters.publish', old.workspace_id) then
    raise exception 'Publish permission is required.' using errcode = '42501';
  end if;
  if old.status = 'PUBLISHED' and new.status = 'SUBMITTED' and not private.has_permission('letters.submit', old.workspace_id) then
    raise exception 'Submit permission is required.' using errcode = '42501';
  end if;
  if (new.published_at is distinct from old.published_at or new.published_by is distinct from old.published_by)
    and not private.has_permission('letters.publish', old.workspace_id) then
    raise exception 'Publish permission is required.' using errcode = '42501';
  end if;
  if (new.submitted_at is distinct from old.submitted_at or new.submitted_by is distinct from old.submitted_by or new.final_pdf_path is distinct from old.final_pdf_path or new.final_pdf_hash is distinct from old.final_pdf_hash)
    and not private.has_permission('letters.submit', old.workspace_id) then
    raise exception 'Submit permission is required.' using errcode = '42501';
  end if;
  if (new.archived_at is distinct from old.archived_at or new.archived_by is distinct from old.archived_by)
    and not private.has_permission('letters.archive', old.workspace_id) then
    raise exception 'Archive permission is required.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['updated_at', 'published_at', 'published_by', 'submitted_at', 'submitted_by', 'final_pdf_path', 'final_pdf_hash', 'archived_at', 'archived_by'])
    is distinct from (to_jsonb(old) - array['updated_at', 'published_at', 'published_by', 'submitted_at', 'submitted_by', 'final_pdf_path', 'final_pdf_hash', 'archived_at', 'archived_by'])
    and not private.can_edit_letter(old.workspace_id, old.department_id, old.prepared_by) then
    raise exception 'Letter edit permission is required.' using errcode = '42501';
  end if;
  if new.status = 'SUBMITTED' and (new.submitted_at is null or new.submitted_by is null or nullif(new.final_pdf_path, '') is null or nullif(new.final_pdf_hash, '') is null) then
    raise exception 'A submitted letter requires a final PDF, hash, submitter, and timestamp.' using errcode = '23514';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists letters_update_guard on public.letters;
create trigger letters_update_guard before update on public.letters for each row execute procedure private.guard_letter_update();

alter table public.letter_reference_sequences enable row level security;
alter table public.letter_templates enable row level security;
alter table public.letters enable row level security;
alter table public.letter_versions enable row level security;
alter table public.letter_attachments enable row level security;

revoke all on public.letter_reference_sequences, public.letter_templates, public.letters, public.letter_versions, public.letter_attachments from anon, authenticated;
grant select, insert, update on public.letter_templates to authenticated;
grant delete on public.letter_templates to authenticated;
grant select, insert, update on public.letters to authenticated;
grant select, insert on public.letter_versions to authenticated;
grant select, insert, update, delete on public.letter_attachments to authenticated;
grant execute on function public.allocate_letter_reference(uuid, date, uuid, text) to authenticated;
grant execute on function public.record_letter_audit(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.enqueue_letter_notification(uuid, text, text, text, uuid, uuid[]) to authenticated;

drop policy if exists letters_read on public.letters;
create policy letters_read on public.letters for select to authenticated using (private.can_read_letter(workspace_id, department_id, prepared_by));
drop policy if exists letters_create on public.letters;
create policy letters_create on public.letters for insert to authenticated with check (prepared_by = auth.uid() and private.has_permission('letters.create', workspace_id));
drop policy if exists letters_update on public.letters;
create policy letters_update on public.letters for update to authenticated using ((private.can_edit_letter(workspace_id, department_id, prepared_by) or private.has_permission('letters.publish', workspace_id) or private.has_permission('letters.submit', workspace_id) or private.has_permission('letters.archive', workspace_id)) and status <> 'SUBMITTED') with check (private.can_edit_letter(workspace_id, department_id, prepared_by) or private.has_permission('letters.publish', workspace_id) or private.has_permission('letters.submit', workspace_id) or private.has_permission('letters.archive', workspace_id));

drop policy if exists letter_templates_read on public.letter_templates;
create policy letter_templates_read on public.letter_templates for select to authenticated using (private.has_permission('letters.read', workspace_id) or private.has_permission('letters.manage_templates', workspace_id));
drop policy if exists letter_templates_create on public.letter_templates;
create policy letter_templates_create on public.letter_templates for insert to authenticated with check (created_by = auth.uid() and private.has_permission('letters.manage_templates', workspace_id));
drop policy if exists letter_templates_update on public.letter_templates;
create policy letter_templates_update on public.letter_templates for update to authenticated using (private.has_permission('letters.manage_templates', workspace_id)) with check (private.has_permission('letters.manage_templates', workspace_id));
drop policy if exists letter_templates_delete on public.letter_templates;
create policy letter_templates_delete on public.letter_templates for delete to authenticated using (private.has_permission('letters.manage_templates', workspace_id));

drop policy if exists letter_versions_read on public.letter_versions;
create policy letter_versions_read on public.letter_versions for select to authenticated using (exists (select 1 from public.letters letter where letter.id = letter_versions.letter_id and private.can_read_letter(letter.workspace_id, letter.department_id, letter.prepared_by)));
drop policy if exists letter_versions_create on public.letter_versions;
create policy letter_versions_create on public.letter_versions for insert to authenticated with check (created_by = auth.uid() and exists (select 1 from public.letters letter where letter.id = letter_versions.letter_id and (private.can_edit_letter(letter.workspace_id, letter.department_id, letter.prepared_by) or private.has_permission('letters.publish', letter.workspace_id) or private.has_permission('letters.submit', letter.workspace_id))));

drop policy if exists letter_attachments_read on public.letter_attachments;
create policy letter_attachments_read on public.letter_attachments for select to authenticated using (exists (select 1 from public.letters letter where letter.id = letter_attachments.letter_id and private.can_read_letter(letter.workspace_id, letter.department_id, letter.prepared_by)));
drop policy if exists letter_attachments_create on public.letter_attachments;
create policy letter_attachments_create on public.letter_attachments for insert to authenticated with check (uploaded_by = auth.uid() and exists (select 1 from public.letters letter where letter.id = letter_attachments.letter_id and letter.status <> 'SUBMITTED' and private.can_edit_letter(letter.workspace_id, letter.department_id, letter.prepared_by)));
drop policy if exists letter_attachments_update on public.letter_attachments;
create policy letter_attachments_update on public.letter_attachments for update to authenticated using (exists (select 1 from public.letters letter where letter.id = letter_attachments.letter_id and letter.status <> 'SUBMITTED' and (private.can_edit_letter(letter.workspace_id, letter.department_id, letter.prepared_by) or private.has_permission('letters.edit_all', letter.workspace_id)))) with check (true);
drop policy if exists letter_attachments_delete on public.letter_attachments;
create policy letter_attachments_delete on public.letter_attachments for delete to authenticated using (exists (select 1 from public.letters letter where letter.id = letter_attachments.letter_id and letter.status <> 'SUBMITTED' and (private.can_edit_letter(letter.workspace_id, letter.department_id, letter.prepared_by) or private.has_permission('letters.edit_all', letter.workspace_id))));

-- Private bucket. The app uses signed URLs and stores only opaque paths in the DB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('betanor-letters', 'betanor-letters', false, 10485760, array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg', 'text/plain']::text[])
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists letters_storage_read on storage.objects;
create policy letters_storage_read on storage.objects for select to authenticated using (
  bucket_id = 'betanor-letters' and (
    exists (select 1 from public.letter_attachments attachment join public.letters letter on letter.id = attachment.letter_id where attachment.storage_path = storage.objects.name and attachment.deleted_at is null and private.can_read_letter(letter.workspace_id, letter.department_id, letter.prepared_by))
    or exists (select 1 from public.letters letter where letter.final_pdf_path = storage.objects.name and private.can_read_letter(letter.workspace_id, letter.department_id, letter.prepared_by))
  )
);
drop policy if exists letters_storage_insert on storage.objects;
create policy letters_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'betanor-letters' and exists (
    select 1
    from public.profiles profile
    join public.letters letter on letter.workspace_id = profile.workspace_id and letter.id = (storage.foldername(storage.objects.name))[2]::uuid
    where profile.id = auth.uid()
      and profile.workspace_id = (storage.foldername(storage.objects.name))[1]::uuid
      and (
        (storage.filename(storage.objects.name) <> 'final.pdf' and letter.status <> 'SUBMITTED' and private.can_edit_letter(letter.workspace_id, letter.department_id, letter.prepared_by))
        or (storage.filename(storage.objects.name) = 'final.pdf' and letter.status = 'PUBLISHED' and letter.final_pdf_path is null and private.has_permission('letters.submit', letter.workspace_id))
      )
  )
);
drop policy if exists letters_storage_delete on storage.objects;
create policy letters_storage_delete on storage.objects for delete to authenticated using (
  bucket_id = 'betanor-letters' and exists (
    select 1 from public.letter_attachments attachment join public.letters letter on letter.id = attachment.letter_id where attachment.storage_path = storage.objects.name and letter.status <> 'SUBMITTED' and (private.can_edit_letter(letter.workspace_id, letter.department_id, letter.prepared_by) or private.has_permission('letters.edit_all', letter.workspace_id))
  )
);

revoke all on function private.letter_workspace(uuid), private.can_read_letter(uuid, uuid, uuid), private.can_edit_letter(uuid, uuid, uuid), private.guard_letter_update() from public, anon;
grant execute on function private.letter_workspace(uuid), private.can_read_letter(uuid, uuid, uuid), private.can_edit_letter(uuid, uuid, uuid) to authenticated;
