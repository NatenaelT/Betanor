-- A muted in-app event must not prevent an independently enabled Telegram
-- delivery for application events. Chat/support already have their own outbox.
create or replace function private.filter_notification_by_user_preference()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient_workspace_id uuid;
begin
  if private.notification_event_allowed(new.recipient_id, new.type, 'in_app') then
    return new;
  end if;

  if left(upper(new.type), 8) <> 'SUPPORT_'
     and left(upper(new.type), 5) <> 'CHAT_'
     and exists (
       select 1 from public.support_notification_preferences preference
       join public.telegram_connections connection on connection.profile_id = preference.profile_id
       where preference.profile_id = new.recipient_id and preference.telegram
     ) and private.notification_event_allowed(new.recipient_id, new.type, 'telegram') then
    select profile.workspace_id into recipient_workspace_id
    from public.profiles profile
    where profile.id = new.recipient_id and profile.is_active;
    if recipient_workspace_id is not null then
      insert into public.support_notification_outbox(workspace_id, profile_id, event_type, channel, payload)
      values (recipient_workspace_id, new.recipient_id, new.type, 'telegram',
        jsonb_build_object('entity_type', new.entity_type, 'entity_id', new.entity_id));
    end if;
  end if;
  return null;
end;
$$;
