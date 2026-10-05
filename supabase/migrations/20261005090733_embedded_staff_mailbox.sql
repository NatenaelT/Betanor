-- Per-staff IMAP/SMTP mailboxes, mailbox preferences, inbox metadata and private attachments.
-- Mail passwords are encrypted in the application before they reach this table.

create table if not exists public.email_mailboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  email_address text not null,
  status text not null default 'DISCONNECTED'
    check (status in ('DISCONNECTED', 'CONNECTED', 'ERROR')),
  signature_text text not null default '' check (length(signature_text) <= 8000),
  sync_cursor jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id),
  unique (workspace_id, email_address)
);

create table if not exists public.email_mailbox_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  imap_host text not null default 'ouzo.hostns.io',
  imap_port integer not null default 993 check (imap_port between 1 and 65535),
  imap_secure boolean not null default true,
  smtp_host text not null default 'ouzo.hostns.io',
  smtp_port integer not null default 465 check (smtp_port between 1 and 65535),
  smtp_secure boolean not null default true,
  max_attachment_bytes bigint not null default 52428800
    check (max_attachment_bytes between 1048576 and 52428800),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.email_mailbox_credentials (
  mailbox_id uuid primary key references public.email_mailboxes(id) on delete cascade,
  encrypted_password text not null,
  encryption_version smallint not null default 1 check (encryption_version = 1),
  updated_at timestamptz not null default now()
);

alter table public.email_mailboxes enable row level security;
alter table public.email_mailbox_settings enable row level security;
alter table public.email_mailbox_credentials enable row level security;

revoke all on public.email_mailboxes from anon, authenticated;
revoke all on public.email_mailbox_settings from anon, authenticated;
revoke all on public.email_mailbox_credentials from anon, authenticated;
grant all on public.email_mailbox_credentials to service_role;

grant select, insert, update on public.email_mailboxes to authenticated;
grant select, insert, update on public.email_mailbox_settings to authenticated;

drop policy if exists email_mailboxes_read on public.email_mailboxes;
create policy email_mailboxes_read on public.email_mailboxes for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select private.has_permission('email.read_all', workspace_id))
    or (select private.has_permission('email.manage', workspace_id))
  );

drop policy if exists email_mailboxes_insert_own on public.email_mailboxes;
create policy email_mailboxes_insert_own on public.email_mailboxes for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (select private.has_permission('email.read', workspace_id))
  );

drop policy if exists email_mailboxes_update_own on public.email_mailboxes;
create policy email_mailboxes_update_own on public.email_mailboxes for update to authenticated
  using (profile_id = (select auth.uid()) and (select private.has_permission('email.read', workspace_id)))
  with check (profile_id = (select auth.uid()) and (select private.has_permission('email.read', workspace_id)));

drop policy if exists email_mailboxes_delete_own on public.email_mailboxes;

drop policy if exists email_mailbox_settings_read on public.email_mailbox_settings;
create policy email_mailbox_settings_read on public.email_mailbox_settings for select to authenticated
  using (
    (select private.has_permission('email.read', workspace_id))
    or (select private.has_permission('email.manage', workspace_id))
  );

drop policy if exists email_mailbox_settings_insert_manage on public.email_mailbox_settings;
create policy email_mailbox_settings_insert_manage on public.email_mailbox_settings for insert to authenticated
  with check ((select private.has_permission('email.manage', workspace_id)));

drop policy if exists email_mailbox_settings_update_manage on public.email_mailbox_settings;
create policy email_mailbox_settings_update_manage on public.email_mailbox_settings for update to authenticated
  using ((select private.has_permission('email.manage', workspace_id)))
  with check ((select private.has_permission('email.manage', workspace_id)));

-- Only server-side code uses service_role for mailbox secrets. Authenticated users
-- cannot query the credential table, even though they can manage their own mailbox.
create or replace function public.email_mailbox_secret_save(mailbox_id_input uuid, encrypted_password_input text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or length(encrypted_password_input) > 4096 then
    raise exception 'Mailbox credential update is not authorized.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.email_mailboxes mailbox
    where mailbox.id = mailbox_id_input
      and mailbox.profile_id = (select auth.uid())
  ) then
    raise exception 'Mailbox is not owned by the current user.' using errcode = '42501';
  end if;
  insert into public.email_mailbox_credentials(mailbox_id, encrypted_password, updated_at)
  values (mailbox_id_input, encrypted_password_input, now())
  on conflict (mailbox_id) do update
    set encrypted_password = excluded.encrypted_password,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.email_mailbox_secret_get(mailbox_id_input uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare result text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.email_mailboxes mailbox
    where mailbox.id = mailbox_id_input
      and mailbox.profile_id = (select auth.uid())
  ) then
    raise exception 'Mailbox is not owned by the current user.' using errcode = '42501';
  end if;
  select credential.encrypted_password into result
  from public.email_mailbox_credentials credential
  where credential.mailbox_id = mailbox_id_input;
  return result;
end;
$$;

create or replace function public.email_mailbox_secret_delete(mailbox_id_input uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.email_mailboxes mailbox
    where mailbox.id = mailbox_id_input
      and mailbox.profile_id = (select auth.uid())
  ) then
    raise exception 'Mailbox is not owned by the current user.' using errcode = '42501';
  end if;
  delete from public.email_mailbox_credentials where mailbox_id = mailbox_id_input;
end;
$$;

revoke all on function public.email_mailbox_secret_save(uuid, text) from public, anon;
revoke all on function public.email_mailbox_secret_get(uuid) from public, anon;
revoke all on function public.email_mailbox_secret_delete(uuid) from public, anon;
grant execute on function public.email_mailbox_secret_save(uuid, text) to authenticated;
grant execute on function public.email_mailbox_secret_get(uuid) to authenticated;
grant execute on function public.email_mailbox_secret_delete(uuid) to authenticated;

create or replace function private.enforce_mailbox_registered_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare auth_email text;
begin
  select lower(user_record.email) into auth_email
  from auth.users user_record
  where user_record.id = new.profile_id;
  if auth_email is null or lower(new.email_address) is distinct from auth_email then
    raise exception 'Mailbox address must match the authenticated account email.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_mailbox_registered_email on public.email_mailboxes;
create trigger enforce_mailbox_registered_email
before insert or update of profile_id, email_address on public.email_mailboxes
for each row execute function private.enforce_mailbox_registered_email();

alter table public.email_messages
  add column if not exists mailbox_id uuid references public.email_mailboxes(id) on delete set null,
  add column if not exists mail_folder text,
  add column if not exists rfc_message_id text,
  add column if not exists imap_uid bigint,
  add column if not exists imap_uid_validity bigint,
  add column if not exists received_at timestamptz,
  add column if not exists is_read boolean not null default true,
  add column if not exists is_starred boolean not null default false;

update public.email_messages
set mail_folder = case when status = 'DRAFT' then 'DRAFTS' else 'SENT' end
where mail_folder is null;

alter table public.email_messages
  alter column mail_folder set default 'SENT',
  alter column mail_folder set not null;

alter table public.email_messages drop constraint if exists email_messages_status_check;
alter table public.email_messages add constraint email_messages_status_check
  check (status in ('DRAFT', 'SENT', 'FAILED', 'RECEIVED'));
alter table public.email_messages drop constraint if exists email_messages_to_addresses_check;
alter table public.email_messages drop constraint if exists email_messages_folder_check;
alter table public.email_messages add constraint email_messages_folder_check
  check (mail_folder in ('INBOX', 'SENT', 'DRAFTS', 'ARCHIVE', 'TRASH'));

create unique index if not exists email_messages_imap_uid_idx
  on public.email_messages(mailbox_id, imap_uid_validity, imap_uid);
create index if not exists email_messages_rfc_id_idx
  on public.email_messages(mailbox_id, rfc_message_id);
create index if not exists email_messages_mailbox_folder_created_idx
  on public.email_messages(mailbox_id, mail_folder, created_at desc);
create index if not exists email_messages_mailbox_unread_idx
  on public.email_messages(mailbox_id, received_at desc)
  where is_read = false;

drop policy if exists email_messages_create_incoming_own on public.email_messages;
create policy email_messages_create_incoming_own on public.email_messages for insert to authenticated
  with check (
    status = 'RECEIVED'
    and mail_folder = 'INBOX'
    and sender_profile_id = (select auth.uid())
    and mailbox_id is not null
    and exists (
      select 1 from public.email_mailboxes mailbox
      where mailbox.id = email_messages.mailbox_id
        and mailbox.profile_id = (select auth.uid())
        and mailbox.workspace_id = email_messages.workspace_id
    )
  );

create or replace function private.validate_mailbox_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mailbox_email text;
  auth_email text;
begin
  if new.mailbox_id is null then
    return new;
  end if;
  select lower(mailbox.email_address) into mailbox_email
  from public.email_mailboxes mailbox
  where mailbox.id = new.mailbox_id
    and mailbox.profile_id = (select auth.uid())
    and mailbox.workspace_id = new.workspace_id;
  select lower(user_record.email) into auth_email
  from auth.users user_record
  where user_record.id = (select auth.uid());
  if mailbox_email is null or auth_email is null or mailbox_email <> auth_email
    or new.sender_profile_id <> (select auth.uid()) then
    raise exception 'Mailbox messages must belong to the authenticated registered email.' using errcode = '42501';
  end if;
  if new.status = 'DRAFT' and new.mail_folder = 'DRAFTS' and lower(new.sender_email) = auth_email then
    return new;
  end if;
  if new.status = 'RECEIVED' and new.mail_folder = 'INBOX' then
    return new;
  end if;
  raise exception 'New mailbox messages must be drafts or received inbox messages.' using errcode = '42501';
end;
$$;

drop trigger if exists validate_mailbox_message_insert on public.email_messages;
create trigger validate_mailbox_message_insert
before insert on public.email_messages
for each row execute function private.validate_mailbox_message_insert();

drop policy if exists email_messages_update_mailbox_flags on public.email_messages;
create policy email_messages_update_mailbox_flags on public.email_messages for update to authenticated
  using (
    mailbox_id is not null
    and status in ('SENT', 'RECEIVED')
    and sender_profile_id = (select auth.uid())
    and exists (
      select 1 from public.email_mailboxes mailbox
      where mailbox.id = email_messages.mailbox_id
        and mailbox.profile_id = (select auth.uid())
    )
  )
  with check (
    mailbox_id is not null
    and status in ('SENT', 'RECEIVED')
    and sender_profile_id = (select auth.uid())
    and exists (
      select 1 from public.email_mailboxes mailbox
      where mailbox.id = email_messages.mailbox_id
        and mailbox.profile_id = (select auth.uid())
    )
  );

create or replace function private.protect_finalized_mailbox_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('SENT', 'RECEIVED') then
    if new.status is distinct from old.status
      or row(
        new.workspace_id, new.sender_profile_id, new.sender_email, new.sender_name,
        new.to_addresses, new.cc_addresses, new.bcc_addresses, new.participant_profile_ids,
        new.subject, new.body_text, new.body_html, new.parent_message_id,
        new.mailbox_id, new.rfc_message_id, new.imap_uid, new.imap_uid_validity,
        new.received_at, new.sent_at, new.provider_message_id, new.delivery_error,
        new.created_at
      ) is distinct from row(
        old.workspace_id, old.sender_profile_id, old.sender_email, old.sender_name,
        old.to_addresses, old.cc_addresses, old.bcc_addresses, old.participant_profile_ids,
        old.subject, old.body_text, old.body_html, old.parent_message_id,
        old.mailbox_id, old.rfc_message_id, old.imap_uid, old.imap_uid_validity,
        old.received_at, old.sent_at, old.provider_message_id, old.delivery_error,
        old.created_at
      ) then
      raise exception 'Delivered mailbox message content is immutable.' using errcode = '55000';
    end if;
    if new.mail_folder = 'DRAFTS'
      or (new.mail_folder is distinct from old.mail_folder
        and new.mail_folder not in ('ARCHIVE', 'TRASH')
        and not (old.mail_folder in ('ARCHIVE', 'TRASH') and new.mail_folder in ('INBOX', 'SENT'))) then
      raise exception 'Mailbox message cannot be moved to that folder.' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_finalized_mailbox_message on public.email_messages;
create trigger protect_finalized_mailbox_message
before update on public.email_messages
for each row execute function private.protect_finalized_mailbox_message();

create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes between 0 and 52428800),
  storage_path text not null unique,
  content_id text,
  disposition text not null default 'attachment' check (disposition in ('attachment', 'inline')),
  created_at timestamptz not null default now()
);

create index if not exists email_attachments_message_idx
  on public.email_attachments(email_message_id, created_at);

alter table public.email_attachments enable row level security;
revoke all on public.email_attachments from anon, authenticated;
grant select, insert, delete on public.email_attachments to authenticated;

drop policy if exists email_attachments_read on public.email_attachments;
create policy email_attachments_read on public.email_attachments for select to authenticated
  using (exists (
    select 1 from public.email_messages message
    where message.id = email_attachments.email_message_id
  ));

drop policy if exists email_attachments_create on public.email_attachments;
create policy email_attachments_create on public.email_attachments for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and storage_path like ((select auth.uid())::text || '/' || email_message_id::text || '/%')
    and exists (
      select 1 from public.email_messages message
      where message.id = email_attachments.email_message_id
        and message.workspace_id = email_attachments.workspace_id
        and message.sender_profile_id = (select auth.uid())
        and (
          (message.mail_folder = 'DRAFTS' and (select private.has_permission('email.send', message.workspace_id)))
          or (message.status = 'RECEIVED' and message.mailbox_id is not null
            and (select private.has_permission('email.read', message.workspace_id)))
        )
    )
  );

drop policy if exists email_attachments_delete_own_draft on public.email_attachments;
create policy email_attachments_delete_own_draft on public.email_attachments for delete to authenticated
  using (exists (
    select 1 from public.email_messages message
    where message.id = email_attachments.email_message_id
      and message.sender_profile_id = (select auth.uid())
      and message.mail_folder = 'DRAFTS'
      and (select private.has_permission('email.send', message.workspace_id))
  ));

-- Extend the existing private attachment bucket to 50 MiB. Provider message-size
-- limits are separate and can be lower than this portal/storage upload cap.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('betanor-email-attachments', 'betanor-email-attachments', false, 52428800, null)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = null;

drop policy if exists email_attachment_files_read on storage.objects;
create policy email_attachment_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'betanor-email-attachments'
    and (
      exists (
        select 1 from public.email_attachments attachment
        where attachment.storage_path = storage.objects.name
      )
      or exists (
        select 1 from public.email_messages message
        where message.id::text = (storage.foldername(name))[2]
          and message.sender_profile_id = (select auth.uid())
          and (message.mail_folder = 'DRAFTS' or message.status = 'RECEIVED')
          and (storage.foldername(name))[1] = (select auth.uid())::text
          and (
            (message.mail_folder = 'DRAFTS' and (select private.has_permission('email.send', message.workspace_id)))
            or (message.status = 'RECEIVED' and (select private.has_permission('email.read', message.workspace_id)))
          )
      )
    )
  );

drop policy if exists email_attachment_files_create on storage.objects;
create policy email_attachment_files_create on storage.objects for insert to authenticated
  with check (
    bucket_id = 'betanor-email-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.email_messages message
      where message.id::text = (storage.foldername(name))[2]
        and message.sender_profile_id = (select auth.uid())
        and (
          (message.mail_folder = 'DRAFTS' and (select private.has_permission('email.send', message.workspace_id)))
          or (message.status = 'RECEIVED' and (select private.has_permission('email.read', message.workspace_id)))
        )
    )
  );

drop policy if exists email_attachment_files_update on storage.objects;
create policy email_attachment_files_update on storage.objects for update to authenticated
  using (
    bucket_id = 'betanor-email-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.email_messages message
      where message.id::text = (storage.foldername(name))[2]
        and message.sender_profile_id = (select auth.uid())
        and message.mail_folder = 'DRAFTS'
        and (select private.has_permission('email.send', message.workspace_id))
    )
  )
  with check (
    bucket_id = 'betanor-email-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.email_messages message
      where message.id::text = (storage.foldername(name))[2]
        and message.sender_profile_id = (select auth.uid())
        and message.mail_folder = 'DRAFTS'
        and (select private.has_permission('email.send', message.workspace_id))
    )
  );

drop policy if exists email_attachment_files_delete on storage.objects;
create policy email_attachment_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'betanor-email-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.email_messages message
      where message.id::text = (storage.foldername(name))[2]
        and message.sender_profile_id = (select auth.uid())
        and message.mail_folder = 'DRAFTS'
        and (select private.has_permission('email.send', message.workspace_id))
    )
  );
