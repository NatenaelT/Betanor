-- Durable tender-security reminders. The function is safe to run repeatedly:
-- the unique event key makes each guarantee/day reminder idempotent.
create table if not exists public.tender_reminder_events (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  guarantee_id uuid references public.tender_guarantees(id) on delete cascade,
  reminder_kind text not null check (reminder_kind in ('GUARANTEE_EXPIRY','TENDER_DEADLINE')),
  reminder_date date not null,
  days_before integer not null check (days_before >= 0),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (guarantee_id, reminder_kind, reminder_date, days_before)
);

create index if not exists tender_reminder_events_pending_idx on public.tender_reminder_events(notified_at, reminder_date);
alter table public.tender_reminder_events enable row level security;
revoke all on public.tender_reminder_events from anon, authenticated;

create or replace function public.create_tender_expiry_reminders()
returns integer language plpgsql security definer set search_path = public, private as $$
declare
  item record;
  event_id uuid;
  inserted_count integer := 0;
  recipient uuid;
  days_before integer;
begin
  for item in
    select guarantee.id as guarantee_id, guarantee.tender_id, guarantee.expiry_date,
      tender.workspace_id, tender.reference_number, tender.title,
      guarantee.reference_number as guarantee_reference, guarantee.responsible_user_id,
      tender.owner_id
    from public.tender_guarantees guarantee
    join public.tenders tender on tender.id is not distinct from guarantee.tender_id
    where guarantee.expiry_date is not null
      and guarantee.status not in ('RELEASED','RETURNED','EXPIRED','CANCELLED')
  loop
    days_before := extract(day from age(item.expiry_date, current_date));
    if days_before not in (14, 7, 3, 1) then
      continue;
    end if;
    insert into public.tender_reminder_events(tender_id, guarantee_id, reminder_kind, reminder_date, days_before, notified_at)
      values (item.tender_id, item.guarantee_id, 'GUARANTEE_EXPIRY', item.expiry_date, days_before, current_timestamp)
      on conflict (guarantee_id, reminder_kind, reminder_date, days_before) do nothing
      returning id into event_id;
    if event_id is not null then
      foreach recipient in array array[item.responsible_user_id, item.owner_id]
      loop
        if recipient is not null then
          insert into public.notifications(recipient_id, type, title, body, entity_type, entity_id)
          select recipient, 'tender.guarantee_expiry', 'Tender guarantee expiring',
            format('%s (%s) expires in %s days.', item.guarantee_reference, item.reference_number, days_before),
            'tender', item.tender_id
          where exists (select profile.id from public.profiles profile where profile.id is not distinct from recipient and profile.is_active and profile.workspace_id is not distinct from item.workspace_id);
        end if;
      end loop;
    end if;
    event_id := null;
  end loop;
  return inserted_count;
end;
$$;

revoke all on function public.create_tender_expiry_reminders() from public, anon, authenticated;
grant execute on function public.create_tender_expiry_reminders() to service_role;

-- Supabase projects commonly expose pg_cron in the extensions schema. If it is
-- enabled, schedule the function daily at 06:00 UTC. The guarded dynamic SQL
-- keeps this migration safe on projects where pg_cron has not been enabled yet.
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema extensions';
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''betanor-tender-expiry-reminders''';
    execute $sql$select cron.schedule('betanor-tender-expiry-reminders', '0 6 * * *', 'select public.create_tender_expiry_reminders()')$sql$;
  end if;
exception when others then
  -- Scheduling is operational configuration; the durable function/table still
  -- install successfully and can be invoked by an approved scheduler later.
  null;
end;
$do$;
