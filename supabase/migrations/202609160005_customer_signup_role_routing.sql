-- Self-registered accounts are customers from the first authenticated session.
-- Admin-created identities still receive their explicit role/account type from
-- the admin-user-management function.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare requested_account_type text := lower(coalesce(new.raw_user_meta_data ->> 'account_type', 'staff'));
begin
  if requested_account_type not in ('staff', 'customer') then
    requested_account_type := 'staff';
  end if;
  insert into public.profiles (id, full_name, email_address, phone_e164, account_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, new.phone),
    nullif(lower(trim(new.email)), ''),
    nullif(trim(new.phone), ''),
    requested_account_type
  )
  on conflict (id) do update set
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    email_address = coalesce(public.profiles.email_address, excluded.email_address),
    phone_e164 = coalesce(public.profiles.phone_e164, excluded.phone_e164),
    account_type = case
      when public.profiles.account_type = 'staff' and excluded.account_type = 'customer'
        and not exists (
          select 1 from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          where ur.user_id = public.profiles.id and r.role_type = 'staff'
        ) then 'customer'
      else public.profiles.account_type
    end,
    updated_at = now();
  return new;
end;
$$;
