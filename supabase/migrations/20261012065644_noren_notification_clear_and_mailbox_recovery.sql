-- Let a signed-in user clear only their own notifications.
grant delete on public.notifications to authenticated;

drop policy if exists "users delete their own notifications" on public.notifications;
create policy "users delete their own notifications"
  on public.notifications
  for delete
  to authenticated
  using ((select auth.uid()) = recipient_id);

-- A failed delivery is not a sent message. Recover older failures into Drafts
-- so they no longer appear in Sent and remain visible for follow-up.
update public.email_messages
set status = 'DRAFT',
    mail_folder = 'DRAFTS',
    delivery_error = coalesce(delivery_error, 'SMTP delivery failed previously. This message remains a draft and can be retried.'),
    updated_at = now()
where status = 'FAILED'
  and mail_folder = 'SENT';
