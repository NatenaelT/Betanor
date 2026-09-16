-- Super Admin brand controls and safe department/position administration.
-- Style values are intentionally public-readable because they are rendered on
-- the customer website; only Super Admins can write them.

insert into public.permissions (code, module, description)
values ('style.manage', 'administration', 'Manage global application typography, colors, and density')
on conflict (code) do update set module = excluded.module, description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'SUPER_ADMIN' and r.workspace_id is null and p.code = 'style.manage'
on conflict do nothing;

create or replace function private.is_super_admin(target_workspace_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.code = 'SUPER_ADMIN'
      and (r.workspace_id is null or r.workspace_id = target_workspace_id)
  );
$$;
revoke all on function private.is_super_admin(uuid) from public, anon;
grant execute on function private.is_super_admin(uuid) to authenticated;

create table if not exists public.workspace_style_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  font_family text not null default 'Inter',
  heading_font_family text not null default 'Manrope',
  primary_color text not null default '#12356B',
  accent_color text not null default '#D8A33A',
  surface_color text not null default '#F4F7FB',
  text_color text not null default '#17243A',
  radius_scale text not null default 'medium' check (radius_scale in ('compact', 'medium', 'soft')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.workspace_style_settings (workspace_id)
select id from public.workspaces
on conflict (workspace_id) do nothing;

alter table public.workspace_style_settings enable row level security;
grant select on public.workspace_style_settings to anon, authenticated;
grant insert, update on public.workspace_style_settings to authenticated;
drop policy if exists "public read workspace style" on public.workspace_style_settings;
create policy "public read workspace style" on public.workspace_style_settings
  for select to anon, authenticated using (true);
drop policy if exists "super admins create workspace style" on public.workspace_style_settings;
create policy "super admins create workspace style" on public.workspace_style_settings
  for insert to authenticated
  with check ((select private.is_super_admin(workspace_id)));
drop policy if exists "super admins update workspace style" on public.workspace_style_settings;
create policy "super admins update workspace style" on public.workspace_style_settings
  for update to authenticated
  using ((select private.is_super_admin(workspace_id)))
  with check ((select private.is_super_admin(workspace_id)));

-- Generated codes are allocated in the database, so imports, APIs, and the UI
-- all produce the same stable identifiers. Existing explicit codes are kept.
create sequence if not exists public.department_code_seq;
create sequence if not exists public.position_code_seq;

create or replace function public.generate_department_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := format('DEPT-%s', lpad(nextval('public.department_code_seq')::text, 3, '0'));
  else
    new.code := upper(regexp_replace(btrim(new.code), '[^A-Za-z0-9_-]', '', 'g'));
  end if;
  return new;
end;
$$;

drop trigger if exists departments_generate_code on public.departments;
create trigger departments_generate_code
before insert on public.departments
for each row execute function public.generate_department_code();

create or replace function public.generate_position_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare department_code text;
begin
  if new.department_id is null then
    raise exception 'A departmental position must be linked to a department.' using errcode = '23514';
  end if;
  if new.code is null or btrim(new.code) = '' then
    select d.code into department_code from public.departments d where d.id = new.department_id and d.workspace_id = new.workspace_id;
    if department_code is null then
      raise exception 'The selected department does not belong to this workspace.' using errcode = '23503';
    end if;
    new.code := format('%s-P%s', upper(regexp_replace(department_code, '[^A-Za-z0-9]', '', 'g')), lpad(nextval('public.position_code_seq')::text, 3, '0'));
  else
    new.code := upper(regexp_replace(btrim(new.code), '[^A-Za-z0-9_-]', '', 'g'));
  end if;
  return new;
end;
$$;

drop trigger if exists positions_generate_code on public.positions;
create trigger positions_generate_code
before insert on public.positions
for each row execute function public.generate_position_code();

-- HR and administrators can update/delete structure, while read access remains
-- governed by the existing HR/finance policies.
grant update, delete on public.departments to authenticated;
grant update, delete on public.positions to authenticated;
drop policy if exists "hr managers update departments" on public.departments;
create policy "hr managers update departments" on public.departments
  for update to authenticated
  using ((select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)))
  with check ((select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)));
drop policy if exists "hr managers delete departments" on public.departments;
create policy "hr managers delete departments" on public.departments
  for delete to authenticated
  using ((select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)));
drop policy if exists "hr managers update positions" on public.positions;
create policy "hr managers update positions" on public.positions
  for update to authenticated
  using ((select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)))
  with check ((select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)));
drop policy if exists "hr managers delete positions" on public.positions;
create policy "hr managers delete positions" on public.positions
  for delete to authenticated
  using ((select private.has_permission('hr.manage', workspace_id)) or (select private.has_permission('users.manage', workspace_id)));
