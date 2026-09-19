-- Keep letter allocation aligned with the workspace resolver used by the app.
-- System staff roles may have a null profile.workspace_id; in that case use the
-- first configured Betanor workspace instead of rejecting an otherwise valid
-- staff request. All sequence identifiers remain qualified to avoid collisions
-- with the RETURNS TABLE `period` output column.

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
  select coalesce(
    profile.workspace_id,
    (select workspace.id
     from public.workspaces as workspace
     order by workspace.created_at
     limit 1)
  )
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

  insert into public.letter_reference_sequences (workspace_id, "period", prefix, next_number)
  values (p_workspace_id, period_value, prefix_value, 1)
  on conflict on constraint letter_reference_sequences_workspace_id_period_prefix_key do nothing;

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
