-- Live chat presence/read state, private attachments, and complete employee
-- administration. All writes remain protected by existing RBAC policies.

alter table public.chat_messages
  add column if not exists read_at timestamptz,
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size_bytes bigint;

create index if not exists chat_messages_conversation_read_idx
  on public.chat_messages (conversation_id, read_at)
  where read_at is null;

create or replace function public.mark_chat_messages_read(conversation_id_input uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  workspace_id_value uuid;
  customer_id_value uuid;
  changed_count integer;
begin
  select c.workspace_id, c.customer_id
    into workspace_id_value, customer_id_value
  from public.chat_conversations c
  where c.id = conversation_id_input;

  if actor_id is null or workspace_id_value is null then
    raise exception 'Chat access is required.' using errcode = '42501';
  end if;

  if not (
    (customer_id_value is not null and (select private.customer_portal_has_access(customer_id_value)))
    or (select private.has_permission('chat.manage', workspace_id_value))
  ) then
    raise exception 'You do not have access to this conversation.' using errcode = '42501';
  end if;

  update public.chat_messages
  set read_at = coalesce(read_at, now())
  where conversation_id = conversation_id_input
    and sender_profile_id is distinct from actor_id;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function public.mark_chat_messages_read(uuid) from public, anon;
grant execute on function public.mark_chat_messages_read(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'betanor-chat-attachments',
  'betanor-chat-attachments',
  false,
  10485760,
  array['image/*', 'application/pdf', 'text/plain', 'application/zip', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]
)
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_attachment_upload_admin on storage.objects;
create policy chat_attachment_upload_admin on storage.objects
for insert to authenticated
with check (
  bucket_id = 'betanor-chat-attachments'
  and exists (
    select 1
    from public.chat_conversations c
    where c.id = case
      when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid
      else null
    end
    and (
      (select private.has_permission('chat.manage', c.workspace_id))
      or (c.customer_id is not null and (select private.customer_portal_has_access(c.customer_id)))
    )
  )
);

drop policy if exists chat_attachment_read_authorized on storage.objects;
create policy chat_attachment_read_authorized on storage.objects
for select to authenticated
using (
  bucket_id = 'betanor-chat-attachments'
  and exists (
    select 1
    from public.chat_messages m
    join public.chat_conversations c on c.id = m.conversation_id
    where m.attachment_path = storage.objects.name
      and (
        (select private.has_permission('chat.manage', c.workspace_id))
        or (c.customer_id is not null and (select private.customer_portal_has_access(c.customer_id)))
      )
  )
);

drop policy if exists chat_attachment_delete_admin on storage.objects;
create policy chat_attachment_delete_admin on storage.objects
for delete to authenticated
using (
  bucket_id = 'betanor-chat-attachments'
  and exists (
    select 1
    from public.chat_messages m
    join public.chat_conversations c on c.id = m.conversation_id
    where m.attachment_path = storage.objects.name
      and (select private.has_permission('chat.manage', c.workspace_id))
  )
);

grant select, insert, update, delete on public.employees to authenticated;
drop policy if exists "administrators create employees" on public.employees;
create policy "administrators create employees" on public.employees for insert to authenticated
with check ((select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)));

drop policy if exists "administrators update employees" on public.employees;
create policy "administrators update employees" on public.employees for update to authenticated
using ((select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)))
with check ((select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)));

drop policy if exists "administrators delete employees" on public.employees;
create policy "administrators delete employees" on public.employees for delete to authenticated
using ((select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)));
