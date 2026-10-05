create index if not exists chat_message_revisions_actor_idx
  on public.chat_message_revisions(actor_id) where actor_id is not null;
create index if not exists chat_messages_deleted_by_idx
  on public.chat_messages(deleted_by) where deleted_by is not null;
