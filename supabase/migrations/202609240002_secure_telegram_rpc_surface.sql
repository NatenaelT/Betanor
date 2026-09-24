-- Keep Telegram challenge internals inaccessible to browser roles. The Edge
-- Function verifies the caller's Supabase JWT before invoking these RPCs with
-- the verified profile ID via its service-role client.

drop function if exists public.telegram_create_link_challenge();
drop function if exists public.telegram_user_can_configure();

create or replace function public.telegram_create_link_challenge(profile_id_input uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare token_value text;
begin
  if profile_id_input is null or not exists (
    select 1 from public.profiles p where p.id = profile_id_input and p.is_active
  ) then
    raise exception 'An active Betanor account is required.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.telegram_connections c where c.profile_id = profile_id_input
  ) then
    raise exception 'Disconnect the existing Telegram account before linking a different one.' using errcode = '23505';
  end if;

  delete from public.telegram_link_challenges
  where expires_at < now() - interval '1 day';

  token_value := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.telegram_link_challenges(profile_id, token_hash, expires_at, consumed_at, created_at)
  values (profile_id_input, encode(extensions.digest(token_value, 'sha256'), 'hex'), now() + interval '10 minutes', null, now())
  on conflict (profile_id) do update
    set token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        consumed_at = null,
        created_at = excluded.created_at;
  return token_value;
end;
$$;
revoke all on function public.telegram_create_link_challenge(uuid) from public, anon, authenticated;
grant execute on function public.telegram_create_link_challenge(uuid) to service_role;

create or replace function public.telegram_user_can_configure(profile_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = profile_id_input
      and p.is_active
      and private.has_permission('settings.manage', p.workspace_id)
  );
$$;
revoke all on function public.telegram_user_can_configure(uuid) from public, anon, authenticated;
grant execute on function public.telegram_user_can_configure(uuid) to service_role;

create policy telegram_link_challenges_deny_client
  on public.telegram_link_challenges for all to anon, authenticated
  using (false) with check (false);
create policy telegram_processed_updates_deny_client
  on public.telegram_processed_updates for all to anon, authenticated
  using (false) with check (false);
