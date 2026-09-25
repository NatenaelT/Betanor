-- Optional recipient display names, editable tender checklist categories/files,
-- and a permission-scoped outbound email log linked to business records.

alter table public.letters
  alter column recipient_name drop not null;

alter table public.tender_requirements
  add column if not exists category text not null default 'Other',
  add column if not exists attachment_path text,
  add column if not exists attachment_file_name text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size_bytes bigint,
  add column if not exists attachment_uploaded_at timestamptz;

update public.tender_requirements
set is_mandatory = false,
    updated_at = now()
where title ilike '%cpo%'
   or title ilike '%bank guarantee%'
   or title ilike '%bid securit%';

create index if not exists tender_requirements_tender_category_idx
  on public.tender_requirements(tender_id, category, sort_order);

insert into public.permissions (code, module, description)
values
  ('email.read', 'emails', 'Read email messages sent or addressed to the user'),
  ('email.read_all', 'emails', 'Read all workspace email records'),
  ('email.send', 'emails', 'Compose and send business email'),
  ('email.manage', 'emails', 'Manage email records and delivery settings')
on conflict (code) do update
set module = excluded.module,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission
  on permission.code in ('email.read', 'email.send')
where role.workspace_id is null
  and (role.role_type = 'staff' or role.code in ('SUPER_ADMIN', 'ADMIN'))
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission
  on permission.code in ('email.read_all', 'email.manage')
where role.workspace_id is null
  and role.code in ('SUPER_ADMIN', 'ADMIN')
on conflict do nothing;

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete restrict,
  sender_email text not null,
  sender_name text not null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  bcc_addresses text[] not null default '{}',
  participant_profile_ids uuid[] not null default '{}',
  subject text not null,
  body_text text not null,
  body_html text not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SENT', 'FAILED')),
  provider_message_id text,
  delivery_error text,
  parent_message_id uuid references public.email_messages(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(to_addresses) > 0)
);

create table if not exists public.email_message_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  module text not null check (module in (
    'letters', 'projects', 'tasks', 'tenders', 'quotations', 'contracts',
    'rfqs', 'customers', 'support_tickets', 'employees', 'other'
  )),
  record_id uuid not null,
  record_label text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (email_message_id, module, record_id)
);

create index if not exists email_messages_workspace_created_idx
  on public.email_messages(workspace_id, created_at desc);
create index if not exists email_messages_sender_created_idx
  on public.email_messages(sender_profile_id, created_at desc);
create index if not exists email_messages_participants_gin_idx
  on public.email_messages using gin(participant_profile_ids);
create index if not exists email_messages_status_created_idx
  on public.email_messages(workspace_id, status, created_at desc);
create index if not exists email_message_links_record_idx
  on public.email_message_links(workspace_id, module, record_id, created_at desc);

alter table public.email_messages enable row level security;
alter table public.email_message_links enable row level security;

grant select, insert, update on public.email_messages to authenticated;
grant select, insert, delete on public.email_message_links to authenticated;

create policy email_messages_read on public.email_messages for select to authenticated
  using (
    (select private.has_permission('email.read_all', workspace_id))
    or (
      (select private.has_permission('email.read', workspace_id))
      and (
        sender_profile_id = (select auth.uid())
        or (select auth.uid()) = any(participant_profile_ids)
      )
    )
  );

create policy email_messages_create on public.email_messages for insert to authenticated
  with check (
    sender_profile_id = (select auth.uid())
    and (select private.has_permission('email.send', workspace_id))
  );

create policy email_messages_update_own_draft on public.email_messages for update to authenticated
  using (
    sender_profile_id = (select auth.uid())
    and status = 'DRAFT'
    and (select private.has_permission('email.send', workspace_id))
  )
  with check (
    sender_profile_id = (select auth.uid())
    and (select private.has_permission('email.send', workspace_id))
  );

create policy email_message_links_read on public.email_message_links for select to authenticated
  using (exists (
    select 1 from public.email_messages message
    where message.id = email_message_links.email_message_id
  ));

create policy email_message_links_create on public.email_message_links for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.email_messages message
      where message.id = email_message_links.email_message_id
        and message.workspace_id = email_message_links.workspace_id
        and message.sender_profile_id = (select auth.uid())
        and message.status = 'DRAFT'
    )
  );

create policy email_message_links_delete_own_draft on public.email_message_links for delete to authenticated
  using (exists (
    select 1 from public.email_messages message
    where message.id = email_message_links.email_message_id
      and message.sender_profile_id = (select auth.uid())
      and message.status = 'DRAFT'
      and (select private.has_permission('email.send', message.workspace_id))
  ));

create or replace function private.protect_sent_email_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'SENT' and row(
    new.sender_profile_id, new.sender_email, new.sender_name, new.to_addresses,
    new.cc_addresses, new.bcc_addresses, new.participant_profile_ids,
    new.subject, new.body_text, new.body_html, new.parent_message_id,
    new.sent_at
  ) is distinct from row(
    old.sender_profile_id, old.sender_email, old.sender_name, old.to_addresses,
    old.cc_addresses, old.bcc_addresses, old.participant_profile_ids,
    old.subject, old.body_text, old.body_html, old.parent_message_id,
    old.sent_at
  ) then
    raise exception 'Sent email content is immutable.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_sent_email_message on public.email_messages;
create trigger protect_sent_email_message
before update on public.email_messages
for each row execute function private.protect_sent_email_message();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'betanor-tender-checklists',
  'betanor-tender-checklists',
  false,
  15728640,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'text/plain'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tender_checklist_files_read on storage.objects;
create policy tender_checklist_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'betanor-tender-checklists'
    and exists (
      select 1 from public.tenders tender
      where tender.id::text = (storage.foldername(name))[1]
        and (select private.has_permission('tender.read', tender.workspace_id))
    )
  );

drop policy if exists tender_checklist_files_create on storage.objects;
create policy tender_checklist_files_create on storage.objects for insert to authenticated
  with check (
    bucket_id = 'betanor-tender-checklists'
    and exists (
      select 1 from public.tenders tender
      where tender.id::text = (storage.foldername(name))[1]
        and tender.status <> 'SUBMITTED'
        and (select private.has_permission('tender.edit', tender.workspace_id))
    )
  );

drop policy if exists tender_checklist_files_delete on storage.objects;
create policy tender_checklist_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'betanor-tender-checklists'
    and exists (
      select 1 from public.tenders tender
      where tender.id::text = (storage.foldername(name))[1]
        and tender.status <> 'SUBMITTED'
        and (select private.has_permission('tender.edit', tender.workspace_id))
    )
  );
