-- Private profile avatar storage. The existing profiles.avatar_path column is
-- reused so staff and customers keep one identity record.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('betanor-profile-avatars', 'betanor-profile-avatars', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_avatar_read on storage.objects;
create policy profile_avatar_read on storage.objects
  for select to authenticated
  using (bucket_id = 'betanor-profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists profile_avatar_insert on storage.objects;
create policy profile_avatar_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'betanor-profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists profile_avatar_update on storage.objects;
create policy profile_avatar_update on storage.objects
  for update to authenticated
  using (bucket_id = 'betanor-profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'betanor-profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists profile_avatar_delete on storage.objects;
create policy profile_avatar_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'betanor-profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
