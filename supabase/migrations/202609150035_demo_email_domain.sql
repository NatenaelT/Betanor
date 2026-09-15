-- Move the existing demonstration identities to Betanor's real email domain.
-- This is a forward migration so the already-applied demo migrations remain
-- immutable while the live database receives the new addresses.

alter table if exists private.demo_accounts
  drop constraint if exists demo_accounts_email_check;

update private.demo_accounts
set email = replace(email, '@betanor.test', '@betanor.et')
where email like 'demo.%@betanor.test';

alter table if exists private.demo_accounts
  add constraint demo_accounts_email_check check (email like 'demo.%@betanor.et');

update auth.users
set email = replace(email, '@betanor.test', '@betanor.et'),
    email_change = null,
    email_change_token_new = null,
    email_change_token_current = null,
    email_change_confirm_status = null,
    updated_at = now()
where email like 'demo.%@betanor.test';

-- Keep the role lookup migration-compatible and ensure the public helper
-- reports the new addresses from private.demo_accounts.
create or replace function public.get_demo_accounts()
returns table(email text, label text, role_code text, demo_password text)
language sql security definer set search_path = '' as $$
  select email, label, role_code, demo_password
  from private.demo_accounts
  where is_active
  order by case role_code when 'SUPER_ADMIN' then 1 when 'MANAGEMENT' then 2 when 'ADMIN' then 3 when 'HR_MANAGER' then 4 when 'HR_STAFF' then 5 when 'FINANCE_MANAGER' then 6 else 99 end;
$$;

revoke all on function public.get_demo_accounts() from public, anon, authenticated;
