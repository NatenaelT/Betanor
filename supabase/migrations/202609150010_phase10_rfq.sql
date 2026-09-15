-- Phase 10: public RFQ intake and internal RFQ access.

create or replace function private.rfq_workspace(target_rfq_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select workspace_id from public.rfq_requests where id = target_rfq_id;
$$;

create or replace function public.submit_public_rfq(
  requester_name_input text,
  requester_email_input text,
  requester_phone_input text,
  organization_input text,
  request_type_input text,
  requirements_input text,
  timeline_input text,
  items_input jsonb default '[]'::jsonb
)
returns table(reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  new_rfq_id uuid;
  new_reference text;
  item jsonb;
  item_description text;
  item_quantity numeric;
begin
  if coalesce(length(trim(requester_name_input)), 0) < 2
     or coalesce(length(trim(requester_email_input)), 0) < 5
     or coalesce(length(trim(requirements_input)), 0) < 10 then
    raise exception 'Please provide a name, email address, and sufficient requirements.' using errcode = '22023';
  end if;

  select id into target_workspace_id from public.workspaces where slug = 'betanor';
  if target_workspace_id is null then
    raise exception 'RFQ intake is not configured.' using errcode = 'P0001';
  end if;

  new_reference := format('BTNR-RFQ-%s-%s', to_char(current_date, 'YYYY'), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)));
  insert into public.rfq_requests (workspace_id, reference, requester_name, requester_email, requester_phone, organization, request_type, requirements, timeline, status)
  values (target_workspace_id, new_reference, trim(requester_name_input), lower(trim(requester_email_input)), nullif(trim(requester_phone_input), ''), nullif(trim(organization_input), ''), nullif(trim(request_type_input), ''), trim(requirements_input), nullif(trim(timeline_input), ''), 'submitted')
  returning id into new_rfq_id;

  for item in select value from jsonb_array_elements(coalesce(items_input, '[]'::jsonb))
  loop
    item_description := trim(coalesce(item ->> 'description', ''));
    item_quantity := coalesce(nullif(item ->> 'quantity', '')::numeric, 1);
    if length(item_description) between 2 and 500 and item_quantity > 0 and item_quantity <= 1000000 then
      insert into public.rfq_items (rfq_id, description, quantity, unit, specifications)
      values (new_rfq_id, item_description, item_quantity, nullif(trim(coalesce(item ->> 'unit', '')), ''), coalesce(item -> 'specifications', '{}'::jsonb));
    end if;
  end loop;

  insert into public.audit_events (workspace_id, entity_type, entity_id, action, payload)
  values (target_workspace_id, 'rfq_requests', new_rfq_id, 'public_submit', jsonb_build_object('reference', new_reference));
  return query select new_reference;
end;
$$;

revoke all on function private.rfq_workspace(uuid) from public, anon, authenticated;
grant execute on function private.rfq_workspace(uuid) to authenticated;
revoke all on function public.submit_public_rfq(text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.submit_public_rfq(text, text, text, text, text, text, text, jsonb) to anon, authenticated;

grant select, insert, update on public.rfq_requests, public.rfq_items to authenticated;
create policy "rfq staff read requests" on public.rfq_requests for select to authenticated using ((select private.has_permission('rfq.read', workspace_id)) or (select private.has_permission('rfq.write', workspace_id)));
create policy "rfq staff create requests" on public.rfq_requests for insert to authenticated with check ((select private.has_permission('rfq.write', workspace_id)) and status in ('draft', 'submitted'));
create policy "rfq staff update requests" on public.rfq_requests for update to authenticated using ((select private.has_permission('rfq.write', workspace_id))) with check ((select private.has_permission('rfq.write', workspace_id)));
create policy "rfq staff read items" on public.rfq_items for select to authenticated using ((select private.has_permission('rfq.read', private.rfq_workspace(rfq_id))) or (select private.has_permission('rfq.write', private.rfq_workspace(rfq_id))));
create policy "rfq staff write items" on public.rfq_items for insert to authenticated with check ((select private.has_permission('rfq.write', private.rfq_workspace(rfq_id))));
