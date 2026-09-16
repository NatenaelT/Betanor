-- Enforce account-type boundaries inside the capability helper.
create or replace function private.has_permission(
  requested_permission text,
  target_workspace_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.is_active = true
      and (
        actor.account_type = 'staff'
        or exists (
          select 1 from public.permissions requested
          where requested.code = requested_permission
            and requested.module = 'customer_portal'
        )
      )
  )
  and coalesce(
    (
      select override.is_allowed
      from public.user_permissions override
      join public.permissions permission on permission.id = override.permission_id
      join public.profiles actor on actor.id = override.user_id
      where override.user_id = (select auth.uid())
        and permission.code = requested_permission
        and (actor.account_type = 'staff' or permission.module = 'customer_portal')
      limit 1
    ),
    exists (
      select 1
      from public.user_roles as user_role
      join public.roles as role on role.id = user_role.role_id
      join public.role_permissions as role_permission on role_permission.role_id = role.id
      join public.permissions as permission on permission.id = role_permission.permission_id
      join public.profiles actor on actor.id = user_role.user_id
      where user_role.user_id = (select auth.uid())
        and permission.code = requested_permission
        and (role.workspace_id is null or role.workspace_id = target_workspace_id)
        and (
          role.role_type = 'staff'
          or (role.role_type = 'customer' and permission.module = 'customer_portal')
        )
        and actor.is_active = true
        and (
          actor.account_type = 'staff'
          or permission.module = 'customer_portal'
        )
    )
  );
$$;

revoke all on function private.has_permission(text, uuid) from public, anon;
grant execute on function private.has_permission(text, uuid) to authenticated;
