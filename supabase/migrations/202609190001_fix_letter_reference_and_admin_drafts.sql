-- Fix the letter reference allocator's ambiguous `period` identifier and give
-- administrators an explicit, draft-only delete capability.

create or replace function public.allocate_letter_reference(
  p_workspace_id uuid,
  p_letter_date date,
  p_department_id uuid default null,
  p_prefix text default 'BTNR/LET'
)
returns table(reference_number text, prefix text, period text, sequence_number integer)
language plpgsql security definer set search_path = '' as $$
declare
  actor_workspace uuid;
  period_value text := to_char(coalesce(p_letter_date, current_date), 'YYYY');
  prefix_value text := coalesce(nullif(trim(p_prefix), ''), 'BTNR/LET');
  sequence_value integer;
begin
  select profile.workspace_id
    into actor_workspace
  from public.profiles as profile
  where profile.id = auth.uid()
    and profile.is_active = true;

  if p_workspace_id is null
     or actor_workspace is distinct from p_workspace_id
     or not private.has_permission('letters.create', p_workspace_id) then
    raise exception 'Not authorized to allocate a letter reference.' using errcode = '42501';
  end if;

  if prefix_value !~ '^BTNR/[A-Z0-9]+$' then
    raise exception 'Invalid letter reference prefix.' using errcode = '22023';
  end if;

  if p_department_id is not null and not exists (
    select 1
    from public.departments as department
    where department.id = p_department_id
      and department.workspace_id = p_workspace_id
  ) then
    raise exception 'The selected department does not belong to this workspace.' using errcode = '23503';
  end if;

  insert into public.letter_reference_sequences (workspace_id, period, prefix, next_number)
  values (p_workspace_id, period_value, prefix_value, 1)
  on conflict (workspace_id, period, prefix) do nothing;

  select reference_sequence.next_number
    into sequence_value
  from public.letter_reference_sequences as reference_sequence
  where reference_sequence.workspace_id = p_workspace_id
    and reference_sequence.period = period_value
    and reference_sequence.prefix = prefix_value
  for update;

  update public.letter_reference_sequences as reference_sequence
  set next_number = sequence_value + 1,
      updated_at = now()
  where reference_sequence.workspace_id = p_workspace_id
    and reference_sequence.period = period_value
    and reference_sequence.prefix = prefix_value;

  return query
  select prefix_value || '/' || period_value || '/' || lpad(sequence_value::text, 5, '0'),
    prefix_value,
    period_value,
    sequence_value;
end;
$$;

insert into public.permissions (code, module, description)
values
  ('letters.delete', 'letters', 'Delete draft letters as an administrator')
on conflict (code) do update
set module = excluded.module,
    description = excluded.description;

with role_permissions_seed(role_code, permission_code) as (
  values
    ('SUPER_ADMIN', 'letters.delete'),
    ('ADMIN', 'letters.view_all'),
    ('ADMIN', 'letters.archive'),
    ('ADMIN', 'letters.delete')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from role_permissions_seed
join public.roles as role
  on role.code = role_permissions_seed.role_code
 and role.workspace_id is null
 and role.role_type = 'staff'
join public.permissions as permission
  on permission.code = role_permissions_seed.permission_code
on conflict do nothing;

grant delete on public.letters to authenticated;

drop policy if exists letters_delete on public.letters;
create policy letters_delete on public.letters
for delete to authenticated
using (
  status = 'DRAFT'
  and private.has_permission('letters.delete', workspace_id)
);
