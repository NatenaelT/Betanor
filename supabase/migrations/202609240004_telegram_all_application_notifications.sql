-- Route existing in-app notifications to Telegram for users who explicitly
-- opted in and linked a Telegram account. Support and chat events already
-- enqueue through scoped triggers; exclude them here to avoid duplicate sends.
create or replace function private.telegram_enqueue_application_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_workspace_id uuid;
begin
  if left(upper(new.type), 8) = 'SUPPORT_'
     or left(upper(new.type), 5) = 'CHAT_' then
    return new;
  end if;

  select profile.workspace_id into recipient_workspace_id
  from public.profiles profile
  join public.support_notification_preferences preference
    on preference.profile_id = profile.id and preference.telegram
  join public.telegram_connections connection
    on connection.profile_id = profile.id
  where profile.id = new.recipient_id
    and profile.is_active
    and profile.workspace_id is not null;

  if recipient_workspace_id is null then
    return new;
  end if;

  -- Deliberately omit notification titles and bodies: HR, payroll and finance
  -- records may contain sensitive details. Telegram receives a generic alert
  -- and a safe, allowlisted in-portal destination only.
  insert into public.support_notification_outbox(
    workspace_id, profile_id, event_type, channel, payload
  ) values (
    recipient_workspace_id,
    new.recipient_id,
    new.type,
    'telegram',
    jsonb_build_object(
      'notification_id', new.id,
      'entity_type', new.entity_type,
      'entity_id', new.entity_id
    )
  );

  return new;
end;
$$;
revoke all on function private.telegram_enqueue_application_notification() from public, anon, authenticated;

drop trigger if exists telegram_application_notification on public.notifications;
create trigger telegram_application_notification
  after insert on public.notifications
  for each row execute function private.telegram_enqueue_application_notification();
