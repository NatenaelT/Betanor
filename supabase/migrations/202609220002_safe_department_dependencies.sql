-- Give department administration one permission-checked dependency lookup.
-- The API must not query finance, strategy, and recruitment tables separately
-- with the caller's row policies: a denied read on one unrelated module used
-- to look like an unsafe dependency check.

create or replace function private.department_dependency_counts(
  target_department_id uuid,
  target_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not (
    (select private.has_permission('users.manage', target_workspace_id))
    or (select private.has_permission('hr.manage', target_workspace_id))
  ) then
    raise exception 'Organization management access is required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'positions', (select count(*) from public.positions p where p.id is not null and p.department_id = target_department_id and p.workspace_id = target_workspace_id),
    'employees', (select count(*) from public.employees e where e.id is not null and e.department_id = target_department_id and e.workspace_id = target_workspace_id),
    'department_goals', (select count(*) from public.department_goals g where g.id is not null and g.department_id = target_department_id),
    'budgets', (select count(*) from public.budgets b where b.id is not null and b.department_id = target_department_id and b.workspace_id = target_workspace_id),
    'expenses', (select count(*) from public.expenses x where x.id is not null and x.department_id = target_department_id and x.workspace_id = target_workspace_id),
    'job_openings', (select count(*) from public.job_openings j where j.id is not null and j.department_id = target_department_id and j.workspace_id = target_workspace_id)
  ) into result;

  return result;
end;
$$;

revoke all on function private.department_dependency_counts(uuid, uuid) from public, anon;
grant execute on function private.department_dependency_counts(uuid, uuid) to authenticated;

-- PostgREST exposes public-schema RPCs. This wrapper is invoker-security and
-- delegates to the permission-checked private function above.
create or replace function public.admin_department_dependency_counts(
  target_department_id uuid,
  target_workspace_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.department_dependency_counts(target_department_id, target_workspace_id);
$$;

revoke all on function public.admin_department_dependency_counts(uuid, uuid) from public, anon;
grant execute on function public.admin_department_dependency_counts(uuid, uuid) to authenticated;
