-- Public content, customer-facing advertisements, and operational chat controls.
-- Public assets are intentionally stored in a public bucket because they are
-- displayed on the public website. Private business documents continue to use
-- the existing betanor-letters bucket and its stricter policies.

create table if not exists public.site_content (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_key text not null,
  page text not null,
  section text not null,
  eyebrow text,
  title text,
  body text,
  cta_label text,
  cta_href text,
  image_path text,
  video_path text,
  metadata jsonb not null default '{}'::jsonb,
  status public.record_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, content_key)
);

create table if not exists public.site_content_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.site_content(id) on delete cascade,
  storage_path text not null unique,
  asset_type text not null check (asset_type in ('image', 'video')),
  mime_type text,
  size_bytes bigint,
  alt_text text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.advertisements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  body text,
  cta_label text,
  cta_href text,
  image_path text,
  video_path text,
  placement text not null default 'portal_banner' check (placement in ('portal_banner', 'portal_card', 'public_home', 'public_services')),
  starts_at timestamptz,
  ends_at timestamptz,
  priority integer not null default 0,
  status public.record_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists site_content_public_lookup_idx
  on public.site_content (workspace_id, page, section, status, published_at);
create index if not exists site_content_updated_idx
  on public.site_content (workspace_id, updated_at desc);
create index if not exists site_content_assets_content_idx
  on public.site_content_assets (content_id, asset_type);
create index if not exists advertisements_public_lookup_idx
  on public.advertisements (workspace_id, placement, status, starts_at, ends_at, priority desc);

alter table public.site_content enable row level security;
alter table public.site_content_assets enable row level security;
alter table public.advertisements enable row level security;

grant select on public.site_content, public.site_content_assets, public.advertisements to anon, authenticated;
grant insert, update, delete on public.site_content, public.site_content_assets, public.advertisements to authenticated;

drop policy if exists "public reads published site content" on public.site_content;
create policy "public reads published site content" on public.site_content
  for select to anon, authenticated
  using (status = 'active' and published_at is not null and published_at <= now());

drop policy if exists "cms staff reads site content" on public.site_content;
create policy "cms staff reads site content" on public.site_content
  for select to authenticated
  using (
    (select private.has_permission('cms.read', workspace_id))
    or (select private.has_permission('cms.write', workspace_id))
    or (select private.has_permission('cms.publish', workspace_id))
  );

drop policy if exists "cms writers create site content" on public.site_content;
create policy "cms writers create site content" on public.site_content
  for insert to authenticated
  with check (
    (select private.has_permission('cms.write', workspace_id))
    and status = 'draft'
    and published_at is null
    and created_by = (select auth.uid())
  );

drop policy if exists "cms writers update site content" on public.site_content;
create policy "cms writers update site content" on public.site_content
  for update to authenticated
  using (
    (select private.has_permission('cms.write', workspace_id))
    or (select private.has_permission('cms.publish', workspace_id))
  )
  with check (
    (
      (select private.has_permission('cms.write', workspace_id))
      and status in ('draft', 'archived')
      and published_at is null
    )
    or (
      (select private.has_permission('cms.publish', workspace_id))
      and status = 'active'
      and published_at is not null
    )
  );

drop policy if exists "cms writers delete site content" on public.site_content;
create policy "cms writers delete site content" on public.site_content
  for delete to authenticated
  using (
    (select private.has_permission('cms.write', workspace_id))
    and status in ('draft', 'archived')
  );

drop policy if exists "public reads published site assets" on public.site_content_assets;
create policy "public reads published site assets" on public.site_content_assets
  for select to anon, authenticated
  using (exists (
    select 1 from public.site_content content
    where content.id = site_content_assets.content_id
      and content.status = 'active'
      and content.published_at is not null
      and content.published_at <= now()
  ));

drop policy if exists "cms staff reads site assets" on public.site_content_assets;
create policy "cms staff reads site assets" on public.site_content_assets
  for select to authenticated
  using ((select private.has_permission('cms.read', workspace_id)) or (select private.has_permission('cms.write', workspace_id)) or (select private.has_permission('cms.publish', workspace_id)));

drop policy if exists "cms writers manage site assets" on public.site_content_assets;
create policy "cms writers manage site assets" on public.site_content_assets
  for all to authenticated
  using ((select private.has_permission('cms.write', workspace_id)))
  with check ((select private.has_permission('cms.write', workspace_id)) and created_by = (select auth.uid()));

drop policy if exists "public reads published advertisements" on public.advertisements;
create policy "public reads published advertisements" on public.advertisements
  for select to anon, authenticated
  using (
    status = 'active'
    and published_at is not null
    and published_at <= now()
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists "cms staff reads advertisements" on public.advertisements;
create policy "cms staff reads advertisements" on public.advertisements
  for select to authenticated
  using ((select private.has_permission('cms.read', workspace_id)) or (select private.has_permission('cms.write', workspace_id)) or (select private.has_permission('cms.publish', workspace_id)));

drop policy if exists "cms writers create advertisements" on public.advertisements;
create policy "cms writers create advertisements" on public.advertisements
  for insert to authenticated
  with check ((select private.has_permission('cms.write', workspace_id)) and status = 'draft' and published_at is null and created_by = (select auth.uid()));

drop policy if exists "cms writers update advertisements" on public.advertisements;
create policy "cms writers update advertisements" on public.advertisements
  for update to authenticated
  using ((select private.has_permission('cms.write', workspace_id)) or (select private.has_permission('cms.publish', workspace_id)))
  with check (((select private.has_permission('cms.write', workspace_id)) and status in ('draft', 'archived') and published_at is null) or ((select private.has_permission('cms.publish', workspace_id)) and status = 'active' and published_at is not null));

drop policy if exists "cms writers delete advertisements" on public.advertisements;
create policy "cms writers delete advertisements" on public.advertisements
  for delete to authenticated
  using ((select private.has_permission('cms.write', workspace_id)) and status in ('draft', 'archived'));

-- Public-facing assets are deliberately separate from private letters.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('betanor-site-assets', 'betanor-site-assets', true, 52428800, array['image/*', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_assets_upload on storage.objects;
create policy site_assets_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'betanor-site-assets'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (select private.has_permission('cms.write', case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid else null end))
  );

drop policy if exists site_assets_update on storage.objects;
create policy site_assets_update on storage.objects
  for update to authenticated
  using (bucket_id = 'betanor-site-assets' and (select private.has_permission('cms.write', case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid else null end)))
  with check (bucket_id = 'betanor-site-assets' and (select private.has_permission('cms.write', case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid else null end)));

drop policy if exists site_assets_delete on storage.objects;
create policy site_assets_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'betanor-site-assets' and (select private.has_permission('cms.write', case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid else null end)));

-- The bucket is public for published web media; draft paths remain unlinked
-- from the public site until CMS publication.
drop policy if exists site_assets_read_authenticated on storage.objects;
create policy site_assets_read_authenticated on storage.objects
  for select to authenticated
  using (
    bucket_id = 'betanor-site-assets'
    and (
      (select private.has_permission('cms.read', case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid else null end))
      or exists (select 1 from public.site_content_assets asset join public.site_content content on content.id = asset.content_id where asset.storage_path = storage.objects.name and content.status = 'active' and content.published_at is not null)
    )
  );

-- Seed the current public experience into the CMS inventory. Existing pages use
-- these keys with a safe code fallback while editors transition content.
insert into public.site_content (workspace_id, content_key, page, section, eyebrow, title, body, cta_label, cta_href, status, published_at)
select w.id, seed.content_key, seed.page, seed.section, seed.eyebrow, seed.title, seed.body, seed.cta_label, seed.cta_href, 'active'::public.record_status, now()
from public.workspaces w
cross join (values
  ('home.hero', 'home', 'hero', 'Betanor General Trading P.L.C.', 'Technology You Can Rely On.', 'A dependable technology partner for consulting, software, IT infrastructure, products, security, implementation, training, and long-term support.', 'Explore solutions', '/services'),
  ('home.consultation', 'home', 'consultation', 'Start a conversation', 'Planning a technology project?', 'Share your organization, priorities, and timeline with our team. We will help frame the right next step.', 'Request a quote', '/contact'),
  ('about.hero', 'about', 'hero', 'About Betanor', 'One technology partner. From strategy to support.', 'Betanor General Trading P.L.C. is an Ethiopia-based technology solutions company serving organizations that need dependable digital systems, IT infrastructure, technology products, implementation support, maintenance, and technical capacity building.', null, null),
  ('about.mission', 'about', 'mission', 'Mission', 'Our mission', 'To help organizations build reliable and sustainable technology environments through expert IT consultancy, software solutions, infrastructure, technology products, implementation, training, and responsive technical support.', null, null),
  ('about.vision', 'about', 'vision', 'Vision', 'Our vision', 'To become one of Ethiopia’s most trusted technology solution providers, recognized for innovative, reliable, secure, and sustainable digital and IT infrastructure solutions.', null, null),
  ('services.hero', 'services', 'hero', 'Services & catalogue', 'One connected technology partner for the work ahead.', 'Consulting, solutions, industries, products, and delivery support now live in one clear catalogue. Start with the capability you need, then request a tailored Ethiopian-market quotation.', null, null),
  ('services.capabilities', 'services', 'capabilities', 'Capabilities', 'Services that move from advice to dependable operations.', null, null, null),
  ('services.products', 'services', 'products', 'Technology products', 'Selected products with implementation behind them.', null, null, null),
  ('contact.hero', 'contact', 'hero', 'Contact Betanor', 'Let’s start with the right conversation.', 'Whether you are assessing a project, comparing options, or seeking dependable long-term support, Betanor can help frame the next practical step.', null, null),
  ('footer.contact', 'footer', 'contact', 'Contact', 'Addis Ababa, Ethiopia', 'Eltek Building 103, Bole Woreda 3', '+251 98 201 0088 · +251 91 791 1604 · info@betanor.et', null, null)
) as seed(content_key, page, section, eyebrow, title, body, cta_label, cta_href)
where w.slug = 'betanor'
on conflict (workspace_id, content_key) do nothing;

create or replace function private.touch_public_content()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_public_content() from public, anon, authenticated;

drop trigger if exists site_content_updated_at on public.site_content;
create trigger site_content_updated_at before update on public.site_content for each row execute procedure private.touch_public_content();
drop trigger if exists advertisements_updated_at on public.advertisements;
create trigger advertisements_updated_at before update on public.advertisements for each row execute procedure private.touch_public_content();
