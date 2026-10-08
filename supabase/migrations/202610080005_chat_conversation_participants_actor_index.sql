create index if not exists chat_conversation_participants_added_by_idx
  on public.chat_conversation_participants (added_by)
  where added_by is not null;
