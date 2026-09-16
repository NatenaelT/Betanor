-- Revoking customer access must not overwrite an administrator's staff role.
-- The prior trigger always wrote account_type=customer, including when an
-- access link was deactivated during a staff-role change.

create or replace function private.sync_customer_profile_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active then
    update public.profiles
    set account_type = 'customer', updated_at = now()
    where id = new.profile_id;
  elsif not exists (
    select 1 from public.customer_portal_access active_access
    where active_access.profile_id = new.profile_id and active_access.is_active = true
  ) then
    update public.profiles
    set account_type = 'staff', updated_at = now()
    where id = new.profile_id;
  end if;
  return new;
end;
$$;
