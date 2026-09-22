-- Final tender submissions and their source records are immutable once the
-- tender status becomes SUBMITTED. The trigger is defense in depth in addition
-- to the application transition and the absence of browser update grants.
create or replace function private.prevent_submitted_tender_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_tender_id uuid;
  target_status text;
begin
  if tg_table_name = 'tenders' then
    if old.status = 'SUBMITTED' then raise exception 'Submitted tenders are immutable'; end if;
    return new;
  end if;
  target_tender_id := case when tg_table_name = 'tender_submissions' then old.tender_id else old.tender_id end;
  select status into target_status from public.tenders where id = target_tender_id;
  if target_status = 'SUBMITTED' then raise exception 'Records related to a submitted tender are immutable'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists tenders_immutable_after_submission on public.tenders;
create trigger tenders_immutable_after_submission before update or delete on public.tenders for each row execute function private.prevent_submitted_tender_change();
drop trigger if exists tender_requirements_immutable_after_submission on public.tender_requirements;
create trigger tender_requirements_immutable_after_submission before update or delete on public.tender_requirements for each row execute function private.prevent_submitted_tender_change();
drop trigger if exists tender_guarantees_immutable_after_submission on public.tender_guarantees;
create trigger tender_guarantees_immutable_after_submission before update or delete on public.tender_guarantees for each row execute function private.prevent_submitted_tender_change();
drop trigger if exists tender_task_links_immutable_after_submission on public.tender_task_links;
create trigger tender_task_links_immutable_after_submission before update or delete on public.tender_task_links for each row execute function private.prevent_submitted_tender_change();
drop trigger if exists tender_submissions_immutable_after_submission on public.tender_submissions;
create trigger tender_submissions_immutable_after_submission before update or delete on public.tender_submissions for each row execute function private.prevent_submitted_tender_change();
