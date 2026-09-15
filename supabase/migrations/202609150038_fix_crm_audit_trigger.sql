-- CRM audit records are written from one trigger function attached to tables
-- with different row shapes. Read optional foreign keys from JSON so a
-- customers row is never asked for NEW.customer_id or NEW.lead_id.

create or replace function private.log_crm_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  event_workspace_id uuid;
  new_row jsonb := to_jsonb(new);
begin
  event_workspace_id := nullif(new_row ->> 'workspace_id', '')::uuid;
  if event_workspace_id is null and tg_table_name = 'customer_contacts' then
    event_workspace_id := (
      select customer.workspace_id
      from public.customers as customer
      where customer.id = nullif(new_row ->> 'customer_id', '')::uuid
    );
  elsif event_workspace_id is null and tg_table_name = 'lead_activities' then
    event_workspace_id := (
      select lead.workspace_id
      from public.leads as lead
      where lead.id = nullif(new_row ->> 'lead_id', '')::uuid
    );
  end if;

  insert into public.audit_events (workspace_id, actor_id, entity_type, entity_id, action, payload)
  values (
    event_workspace_id,
    (select auth.uid()),
    tg_table_name,
    nullif(new_row ->> 'id', '')::uuid,
    lower(tg_op),
    jsonb_build_object(
      'status', coalesce(new_row ->> 'status', ''),
      'reference', coalesce(new_row ->> 'title', new_row ->> 'name', '')
    )
  );
  return new;
end;
$function$;
