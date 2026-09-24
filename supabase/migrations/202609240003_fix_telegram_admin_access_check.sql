-- The Edge Function validates the caller's Supabase JWT before passing the
-- resulting profile ID. A service-role RPC has no auth.uid(), so evaluate the
-- same role grants and per-user override for that verified profile explicitly.
create or replace function public.telegram_user_can_configure(profile_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = profile_id_input
      and profile.is_active
      and coalesce(
        (
          select permission_override.is_allowed
          from public.user_permissions permission_override
          join public.permissions permission
            on permission.id = permission_override.permission_id
          where permission_override.user_id = profile.id
            and permission.code = 'settings.manage'
          limit 1
        ),
        exists (
          select 1
          from public.user_roles user_role
          join public.roles role on role.id = user_role.role_id
          join public.role_permissions role_permission on role_permission.role_id = role.id
          join public.permissions permission on permission.id = role_permission.permission_id
          where user_role.user_id = profile.id
            and permission.code = 'settings.manage'
            and (role.workspace_id is null or role.workspace_id = profile.workspace_id)
            and role.role_type = 'staff'
        )
      )
  );
$$;

revoke all on function public.telegram_user_can_configure(uuid) from public, anon, authenticated;
grant execute on function public.telegram_user_can_configure(uuid) to service_role;
