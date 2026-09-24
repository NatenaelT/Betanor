-- Restrict editable payroll data to unpublished draft cycles. Status transitions
-- and bulk spreadsheet changes run through audited, permission-checked functions.

drop policy if exists "payroll managers update cycles" on public.payroll_cycles;
create policy "payroll managers update draft cycles only"
  on public.payroll_cycles for update to authenticated
  using (
    (select private.has_permission('payroll.manage', workspace_id))
    and status = 'draft'
    and published_at is null
  )
  with check (
    (select private.has_permission('payroll.manage', workspace_id))
    and status = 'draft'
    and published_at is null
  );

drop policy if exists "payroll managers create payslips" on public.payslips;
create policy "payroll managers create draft payslips only"
  on public.payslips for insert to authenticated
  with check (
    status = 'draft'
    and exists (
      select 1
      from public.payroll_cycles as cycle
      where cycle.id = payroll_cycle_id
        and cycle.status = 'draft'
        and cycle.published_at is null
        and (select private.has_permission('payroll.manage', cycle.workspace_id))
    )
  );

drop policy if exists "payroll managers update payslips" on public.payslips;
create policy "payroll managers update draft payslips only"
  on public.payslips for update to authenticated
  using (
    status = 'draft'
    and (select private.has_permission('payroll.manage', private.payslip_workspace(id)))
    and exists (
      select 1
      from public.payroll_cycles as cycle
      where cycle.id = payroll_cycle_id
        and cycle.status = 'draft'
        and cycle.published_at is null
    )
  )
  with check (
    status = 'draft'
    and (select private.has_permission('payroll.manage', private.payslip_workspace(id)))
    and exists (
      select 1
      from public.payroll_cycles as cycle
      where cycle.id = payroll_cycle_id
        and cycle.status = 'draft'
        and cycle.published_at is null
    )
  );

create or replace function public.transition_payroll_cycle(
  p_cycle_id uuid,
  p_to_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.payroll_cycles%rowtype;
  actor uuid := auth.uid();
begin
  select * into target
  from public.payroll_cycles
  where id = p_cycle_id
  for update;

  if target.id is null or not (select private.has_permission('payroll.manage', target.workspace_id)) then
    raise exception 'Not authorized to update this payroll cycle.' using errcode = '42501';
  end if;
  if target.published_at is not null then
    raise exception 'Published payroll cycles are immutable.' using errcode = '22023';
  end if;
  if not (
    (target.status = 'draft' and p_to_status = 'submitted')
    or (target.status = 'submitted' and p_to_status = 'approved')
  ) then
    raise exception 'Payroll status transition is not allowed.' using errcode = '22023';
  end if;

  update public.payroll_cycles
  set status = p_to_status::public.approval_status
  where id = p_cycle_id;

  insert into public.audit_events (workspace_id, actor_id, entity_type, entity_id, action, payload)
  values (
    target.workspace_id,
    actor,
    'payroll_cycle',
    p_cycle_id,
    'status_changed',
    jsonb_build_object('from', target.status::text, 'to', p_to_status)
  );

  return true;
end;
$$;

create or replace function public.update_draft_payroll_payslips(
  p_cycle_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.payroll_cycles%rowtype;
  requested_count integer;
  updated_count integer;
begin
  select * into target
  from public.payroll_cycles
  where id = p_cycle_id
  for update;

  if target.id is null or not (select private.has_permission('payroll.manage', target.workspace_id)) then
    raise exception 'Not authorized to edit this payroll cycle.' using errcode = '42501';
  end if;
  if target.status <> 'draft' or target.published_at is not null then
    raise exception 'Only an unpublished draft payroll cycle can be edited.' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Payroll rows must be provided as an array.' using errcode = '22023';
  end if;

  requested_count := jsonb_array_length(p_rows);
  if requested_count < 1 or requested_count > 500 then
    raise exception 'Provide between 1 and 500 payroll rows.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as row_data(id uuid, gross_pay numeric, deductions numeric)
    where row_data.id is null
      or row_data.gross_pay is null
      or row_data.deductions is null
      or row_data.gross_pay < 0
      or row_data.deductions < 0
      or row_data.deductions > row_data.gross_pay
  ) then
    raise exception 'Payroll values are invalid or deductions exceed gross pay.' using errcode = '22023';
  end if;
  if exists (
    select row_data.id
    from jsonb_to_recordset(p_rows) as row_data(id uuid, gross_pay numeric, deductions numeric)
    group by row_data.id
    having count(*) > 1
  ) then
    raise exception 'A payslip cannot appear more than once in an update.' using errcode = '22023';
  end if;

  update public.payslips as slip
  set gross_pay = row_data.gross_pay,
      deductions = row_data.deductions,
      net_pay = row_data.gross_pay - row_data.deductions
  from jsonb_to_recordset(p_rows) as row_data(id uuid, gross_pay numeric, deductions numeric)
  where slip.id = row_data.id
    and slip.payroll_cycle_id = p_cycle_id
    and slip.status = 'draft';

  get diagnostics updated_count = row_count;
  if updated_count <> requested_count then
    raise exception 'One or more payslips do not belong to this editable draft.' using errcode = '22023';
  end if;

  insert into public.audit_events (workspace_id, actor_id, entity_type, entity_id, action, payload)
  values (
    target.workspace_id,
    auth.uid(),
    'payroll_cycle',
    p_cycle_id,
    'draft_payslips_updated',
    jsonb_build_object('updated_count', updated_count)
  );

  return updated_count;
end;
$$;

revoke all on function public.transition_payroll_cycle(uuid, text) from public, anon;
revoke all on function public.update_draft_payroll_payslips(uuid, jsonb) from public, anon;
grant execute on function public.transition_payroll_cycle(uuid, text) to authenticated;
grant execute on function public.update_draft_payroll_payslips(uuid, jsonb) to authenticated;
