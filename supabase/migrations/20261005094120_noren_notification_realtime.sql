-- Reuse the existing per-recipient notification store for Noren.
-- RLS already limits SELECT and read_at UPDATE to auth.uid() = recipient_id.
create index if not exists notifications_recipient_recent_idx
  on public.notifications (recipient_id, created_at desc);

create index if not exists notifications_recipient_unread_recent_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
