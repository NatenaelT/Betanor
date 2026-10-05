-- Treat unexpected user-provided JSON values as enabled rather than casting
-- them inside notification triggers and risking a failed business transaction.
create or replace function private.notification_event_allowed(p_profile uuid, p_event text, p_channel text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.event_settings -> private.notification_event_category(p_event) ->> p_channel <> 'false'
     from public.support_notification_preferences p where p.profile_id = p_profile),
    true
  );
$$;
revoke all on function private.notification_event_allowed(uuid, text, text) from public, anon, authenticated;
