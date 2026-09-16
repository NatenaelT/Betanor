-- Staff role assignments are authoritative for workspace entry. This fixes
-- legacy customer profile classifications after an administrator changes a
-- customer account into a staff or administrator account.

create or replace function private.sync_profile_account_type(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles profile
  set account_type = case
        when exists (
          select 1
          from public.user_roles assignment
          join public.roles role on role.id = assignment.role_id
          where assignment.user_id = target_profile_id
            and role.role_type = 'staff'
        ) then 'staff'
        when exists (
          select 1
          from public.customer_portal_access access_link
          where access_link.profile_id = target_profile_id
            and access_link.is_active = true
        ) then 'customer'
        else 'staff'
      end,
      updated_at = now()
  where profile.id = target_profile_id;
end;
$$;

revoke all on function private.sync_profile_account_type(uuid) from public, anon, authenticated;

create or replace function private.sync_customer_profile_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_profile_account_type(new.profile_id);
  return new;
end;
$$;

create or replace function private.sync_profile_type_from_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.sync_profile_account_type(old.user_id);
    return old;
  end if;
  perform private.sync_profile_account_type(new.user_id);
  return new;
end;
$$;

revoke all on function private.sync_profile_type_from_role() from public, anon, authenticated;

drop trigger if exists user_role_sync_profile_type_after_change on public.user_roles;
create trigger user_role_sync_profile_type_after_change
  after insert or update of user_id, role_id on public.user_roles
  for each row execute procedure private.sync_profile_type_from_role();

drop trigger if exists user_role_sync_profile_type_after_delete on public.user_roles;
create trigger user_role_sync_profile_type_after_delete
  after delete on public.user_roles
  for each row execute procedure private.sync_profile_type_from_role();

-- Reconcile every existing profile once so legacy rows use the same rule.
select private.sync_profile_account_type(profile.id)
from public.profiles profile;
