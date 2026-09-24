create index if not exists telegram_group_bindings_linked_by_idx
  on public.telegram_group_bindings(linked_by)
  where linked_by is not null;
