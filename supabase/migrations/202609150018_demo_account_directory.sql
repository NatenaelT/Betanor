-- Demo credentials are deliberately isolated from the public schema.
-- These accounts are for product demonstrations only and must never contain real data.
create table if not exists private.demo_accounts (
  email text primary key,
  label text not null,
  role_code text not null,
  demo_password text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (email like 'demo.%@betanor.test')
);

insert into private.demo_accounts (email, label, role_code, demo_password) values
  ('demo.superadmin@betanor.test', 'Super administrator', 'SUPER_ADMIN', 'BetanorDemo2026!'),
  ('demo.management@betanor.test', 'Management', 'MANAGEMENT', 'BetanorDemo2026!'),
  ('demo.admin@betanor.test', 'Administrator', 'ADMIN', 'BetanorDemo2026!'),
  ('demo.hrmanager@betanor.test', 'HR manager', 'HR_MANAGER', 'BetanorDemo2026!'),
  ('demo.hrstaff@betanor.test', 'HR staff', 'HR_STAFF', 'BetanorDemo2026!'),
  ('demo.financemanager@betanor.test', 'Finance manager', 'FINANCE_MANAGER', 'BetanorDemo2026!')
on conflict (email) do update set label = excluded.label, role_code = excluded.role_code, demo_password = excluded.demo_password, is_active = true;

-- Keep the Auth accounts usable for demonstrations without exposing passwords in auth metadata.
update auth.users
set encrypted_password = crypt('BetanorDemo2026!', gen_salt('bf')), updated_at = now()
where email in (select email from private.demo_accounts);

create or replace function public.get_demo_accounts()
returns table(email text, label text, role_code text, demo_password text)
language sql security definer set search_path = '' as $$
  select email, label, role_code, demo_password
  from private.demo_accounts
  where is_active
  order by case role_code when 'SUPER_ADMIN' then 1 when 'MANAGEMENT' then 2 when 'ADMIN' then 3 when 'HR_MANAGER' then 4 when 'HR_STAFF' then 5 when 'FINANCE_MANAGER' then 6 else 99 end;
$$;

revoke all on function public.get_demo_accounts() from public;
grant execute on function public.get_demo_accounts() to anon, authenticated;
