-- Keep profile placement and activation out of direct client updates. These
-- security-definer functions are the only admin path for those sensitive fields.
revoke update on public.profiles from authenticated;
grant update (full_name, job_title, avatar_path, locale) on public.profiles to authenticated;

create or replace function public.admin_upsert_profile(
  target_user_id uuid,
  target_workspace_id uuid,
  target_full_name text default null,
  target_job_title text default null,
  target_is_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('users.manage', target_workspace_id) then
    raise exception 'Not authorized to manage user access.' using errcode = '42501';
  end if;
  insert into public.profiles (id, workspace_id, full_name, job_title, is_active)
  values (target_user_id, target_workspace_id, nullif(trim(target_full_name), ''), nullif(trim(target_job_title), ''), target_is_active)
  on conflict (id) do update set workspace_id = excluded.workspace_id, full_name = excluded.full_name, job_title = excluded.job_title, is_active = excluded.is_active, updated_at = now();
end;
$$;
revoke all on function public.admin_upsert_profile(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_upsert_profile(uuid, uuid, text, text, boolean) to authenticated;

create or replace function public.admin_deactivate_profile(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_workspace_id uuid;
begin
  select workspace_id into target_workspace_id from public.profiles where id = target_user_id;
  if target_workspace_id is null or not private.has_permission('users.manage', target_workspace_id) then
    raise exception 'Not authorized to deactivate this user.' using errcode = '42501';
  end if;
  update public.profiles set is_active = false, updated_at = now() where id = target_user_id;
  delete from public.user_roles where user_id = target_user_id;
end;
$$;
revoke all on function public.admin_deactivate_profile(uuid) from public, anon;
grant execute on function public.admin_deactivate_profile(uuid) to authenticated;
