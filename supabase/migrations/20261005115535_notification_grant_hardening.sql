-- RLS does not protect TRUNCATE. These privileges were inherited from broad
-- historical default grants and are unnecessary for user preferences/outbox.
revoke truncate, trigger, references on public.support_notification_preferences,
  public.support_notification_outbox from anon, authenticated;
revoke delete on public.support_notification_preferences from authenticated;
revoke insert, update, delete on public.support_notification_outbox from authenticated;
