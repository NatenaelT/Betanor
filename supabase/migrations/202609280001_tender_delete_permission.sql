-- Allow designated workspace administrators to remove tenders that have not
-- been finalized. The existing database trigger continues to block any delete
-- or update of a SUBMITTED tender, including direct API requests.

insert into public.permissions (code, module, description)
values ('tender.delete', 'tenders', 'Delete tenders that have not been submitted')
on conflict (code) do update
set module = excluded.module,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'tender.delete'
where role.workspace_id is null
  and role.code in ('SUPER_ADMIN', 'ADMIN')
on conflict do nothing;

grant delete on public.tenders to authenticated;

drop policy if exists tender_delete on public.tenders;
create policy tender_delete on public.tenders
  for delete to authenticated
  using ((select private.has_permission('tender.delete', workspace_id)));

-- Storage's authenticated DELETE policy scopes access through the live tender
-- row. Require checklist attachments to be explicitly removed first, so a
-- parent delete can never strand private object files or silently lose them.
create or replace function private.prevent_tender_delete_with_checklist_files()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'SUBMITTED' then
    return old;
  end if;

  if exists (
    select 1
    from public.tender_requirements requirement
    where requirement.tender_id = old.id
      and requirement.attachment_path is not null
  ) then
    raise exception 'Remove tender checklist attachments before deleting this tender.'
      using errcode = '23503';
  end if;

  return old;
end;
$$;

revoke all on function private.prevent_tender_delete_with_checklist_files() from public, anon, authenticated;

drop trigger if exists tender_delete_requires_attachment_cleanup on public.tenders;
create trigger tender_delete_requires_attachment_cleanup
before delete on public.tenders
for each row execute function private.prevent_tender_delete_with_checklist_files();
