-- Employee team chat is an explicit platform capability for every current
-- staff role. Future custom roles remain permission-managed in the admin UI.
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'chat.internal.read'
where role.role_type = 'staff'
on conflict do nothing;
