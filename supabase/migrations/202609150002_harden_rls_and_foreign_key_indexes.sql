-- Make private-by-default access explicit and cover every foreign key with an index.

do $$
declare r record;
begin
  for r in
    select c.oid, n.nspname, rel.relname,
      string_agg(quote_ident(a.attname), ', ' order by u.ordinality) as columns
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join unnest(c.conkey) with ordinality u(attnum, ordinality) on true
    join pg_attribute a on a.attrelid = rel.oid and a.attnum = u.attnum
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indisvalid
          and (i.indkey::smallint[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
      )
    group by c.oid, n.nspname, rel.relname
  loop
    execute format('create index if not exists %I on %I.%I (%s)', 'betanor_fk_' || r.oid || '_idx', r.nspname, r.relname, r.columns);
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'workspaces','departments','roles','permissions','role_permissions','user_roles','employees','employment_contracts','candidates','job_openings','job_applications','leave_types','leave_requests','payroll_cycles','payslips','strategies','annual_goals','department_goals','initiatives','kpis','customers','customer_contacts','leads','lead_activities','consultation_requests','partner_enquiries','rfq_requests','rfq_items','quotations','quotation_items','quotation_versions','contracts','contract_versions','projects','project_members','milestones','tasks','task_assignees','task_comments','chart_of_accounts','finance_categories','budgets','expenses','expense_approvals','invoices','invoice_lines','payments','documents','audit_events'
  ] loop
    execute format('create policy %I on public.%I for all to anon, authenticated using (false) with check (false)', 'deny_direct_client_access', table_name);
  end loop;
end $$;
