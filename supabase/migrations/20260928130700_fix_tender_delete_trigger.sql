-- PostgreSQL exposes OLD, not NEW, to a DELETE trigger. Returning NEW from the
-- tender immutability trigger silently skipped every non-submitted tender row.
-- Keep submitted tenders protected and let permitted deletion proceed by
-- returning OLD for DELETE and NEW for UPDATE.
create or replace function private.prevent_submitted_tender_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_tender_id uuid;
  target_status text;
begin
  if tg_table_name = 'tenders' then
    if old.status = 'SUBMITTED' then
      raise exception 'Submitted tenders are immutable';
    end if;

    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  target_tender_id := old.tender_id;
  select status
    into target_status
    from public.tenders
   where id = target_tender_id;

  if target_status = 'SUBMITTED' then
    raise exception 'Records related to a submitted tender are immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_submitted_tender_change() from public, anon, authenticated;
