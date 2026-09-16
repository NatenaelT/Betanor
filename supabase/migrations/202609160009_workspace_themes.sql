-- Reusable, database-backed themes for the staff workspace and customer portal.
-- The values are public presentation data; mutations remain Super Admin-only.

create table if not exists public.workspace_themes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  template_key text not null default 'classic',
  font_family text not null default 'Inter',
  heading_font_family text not null default 'Manrope',
  primary_color text not null default '#12356B',
  accent_color text not null default '#D8A33A',
  surface_color text not null default '#F4F7FB',
  text_color text not null default '#17243A',
  nav_color text not null default '#0B264F',
  nav_text_color text not null default '#E8F0FF',
  header_color text not null default '#FFFFFF',
  header_text_color text not null default '#12356B',
  footer_color text not null default '#0B264F',
  footer_text_color text not null default '#D5E1F2',
  button_color text not null default '#12356B',
  button_text_color text not null default '#FFFFFF',
  field_background_color text not null default '#FFFFFF',
  field_text_color text not null default '#17243A',
  field_border_color text not null default '#D9E1EC',
  field_focus_color text not null default '#2188FF',
  radius_scale text not null default 'medium' check (radius_scale in ('compact', 'medium', 'soft')),
  is_active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create unique index if not exists workspace_themes_one_active_idx
  on public.workspace_themes(workspace_id) where is_active = true;
create index if not exists workspace_themes_workspace_idx
  on public.workspace_themes(workspace_id, updated_at desc);

insert into public.workspace_themes (
  workspace_id, name, template_key, font_family, heading_font_family,
  primary_color, accent_color, surface_color, text_color,
  nav_color, nav_text_color, header_color, header_text_color,
  footer_color, footer_text_color, button_color, button_text_color,
  field_background_color, field_text_color, field_border_color, field_focus_color,
  radius_scale, is_active
)
select
  w.id,
  'Betanor Classic',
  'classic',
  coalesce(s.font_family, 'Inter'),
  coalesce(s.heading_font_family, 'Manrope'),
  coalesce(s.primary_color, '#12356B'),
  coalesce(s.accent_color, '#D8A33A'),
  coalesce(s.surface_color, '#F4F7FB'),
  coalesce(s.text_color, '#17243A'),
  '#0B264F', '#E8F0FF', '#FFFFFF', '#12356B',
  '#0B264F', '#D5E1F2', '#12356B', '#FFFFFF',
  '#FFFFFF', '#17243A', '#D9E1EC', '#2188FF',
  coalesce(s.radius_scale, 'medium'), true
from public.workspaces w
left join public.workspace_style_settings s on s.workspace_id = w.id
where not exists (select 1 from public.workspace_themes t where t.workspace_id = w.id);

alter table public.workspace_themes enable row level security;
grant select on public.workspace_themes to anon, authenticated;
grant insert, update, delete on public.workspace_themes to authenticated;
drop policy if exists "public read workspace themes" on public.workspace_themes;
create policy "public read workspace themes" on public.workspace_themes
  for select to anon, authenticated using (true);
drop policy if exists "super admins create workspace themes" on public.workspace_themes;
create policy "super admins create workspace themes" on public.workspace_themes
  for insert to authenticated
  with check ((select private.is_super_admin(workspace_id)));
drop policy if exists "super admins update workspace themes" on public.workspace_themes;
create policy "super admins update workspace themes" on public.workspace_themes
  for update to authenticated
  using ((select private.is_super_admin(workspace_id)))
  with check ((select private.is_super_admin(workspace_id)));
drop policy if exists "super admins delete workspace themes" on public.workspace_themes;
create policy "super admins delete workspace themes" on public.workspace_themes
  for delete to authenticated
  using ((select private.is_super_admin(workspace_id)));
