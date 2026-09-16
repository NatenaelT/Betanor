create index if not exists user_permissions_assigned_by_idx
  on public.user_permissions(assigned_by);
