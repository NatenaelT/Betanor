-- Complete the six non-production demo identities with their intended role scopes.
insert into public.user_roles (user_id, role_id)
select u.id, r.id
from auth.users u
join public.roles r on r.workspace_id is null
where (u.email, r.code) in (
  ('demo.superadmin@betanor.test', 'SUPER_ADMIN'),
  ('demo.management@betanor.test', 'MANAGEMENT'),
  ('demo.admin@betanor.test', 'ADMIN'),
  ('demo.hrmanager@betanor.test', 'HR_MANAGER'),
  ('demo.hrstaff@betanor.test', 'HR_STAFF'),
  ('demo.financemanager@betanor.test', 'FINANCE_MANAGER')
)
on conflict (user_id, role_id) do nothing;
