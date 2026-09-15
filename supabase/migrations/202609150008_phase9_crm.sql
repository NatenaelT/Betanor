-- Phase 9: CRM tenant bootstrap, capabilities, access controls, and auditing.

insert into public.workspaces (name, slug, legal_name, timezone, currency_code)
values ('Betanor', 'betanor', 'Betanor General Trading P.L.C.', 'Africa/Addis_Ababa', 'ETB')
on conflict (slug) do update
set name = excluded.name,
    legal_name = excluded.legal_name,
    timezone = excluded.timezone,
    currency_code = excluded.currency_code,
    updated_at = now();

insert into public.permissions (code, module, description)
values
  ('rfq.read', 'commercial', 'Read RFQ records'),
  ('rfq.write', 'commercial', 'Create or manage RFQ records'),
  ('chat.manage', 'commercial', 'Manage guest chat conversations'),
  ('contract.read', 'commercial', 'Read contracts'),
  ('contract.edit', 'commercial', 'Edit contracts')
on conflict (code) do update set module = excluded.module, description = excluded.description;

with role_permissions_seed(role_code, permission_code) as (
  values
    ('SUPER_ADMIN', 'rfq.read'), ('SUPER_ADMIN', 'rfq.write'), ('SUPER_ADMIN', 'chat.manage'), ('SUPER_ADMIN', 'contract.read'), ('SUPER_ADMIN', 'contract.edit'),
    ('MANAGEMENT', 'rfq.read'), ('MANAGEMENT', 'contract.read'),
    ('ADMIN', 'rfq.read'), ('ADMIN', 'rfq.write'), ('ADMIN', 'chat.manage'), ('ADMIN', 'contract.read'), ('ADMIN', 'contract.edit'),
    ('SALES_MANAGER', 'rfq.read'), ('SALES_MANAGER', 'rfq.write'), ('SALES_MANAGER', 'chat.manage'), ('SALES_MANAGER', 'contract.read'), ('SALES_MANAGER', 'contract.edit'),
    ('SALES_STAFF', 'rfq.read'), ('SALES_STAFF', 'rfq.write'), ('SALES_STAFF', 'chat.manage'), ('SALES_STAFF', 'contract.read')
)
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from role_permissions_seed
join public.roles as role on role.code = role_permissions_seed.role_code and role.workspace_id is null
join public.permissions as permission on permission.code = role_permissions_seed.permission_code
on conflict do nothing;

create or replace function private.customer_workspace(target_customer_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select workspace_id from public.customers where id = target_customer_id;
$$;

create or replace function private.lead_workspace(target_lead_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select workspace_id from public.leads where id = target_lead_id;
$$;

create or replace function private.log_crm_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_workspace_id uuid;
begin
  event_workspace_id := case tg_table_name
    when 'customers' then new.workspace_id
    when 'leads' then new.workspace_id
    when 'opportunities' then new.workspace_id
    when 'customer_contacts' then (select customer.workspace_id from public.customers as customer where customer.id = new.customer_id)
    when 'lead_activities' then (select lead.workspace_id from public.leads as lead where lead.id = new.lead_id)
  end;

  insert into public.audit_events (workspace_id, actor_id, entity_type, entity_id, action, payload)
  values (event_workspace_id, (select auth.uid()), tg_table_name, new.id, lower(tg_op), jsonb_build_object('status', coalesce(to_jsonb(new) ->> 'status', ''), 'reference', coalesce(to_jsonb(new) ->> 'title', to_jsonb(new) ->> 'name', '')));
  return new;
end;
$$;

revoke all on function private.customer_workspace(uuid), private.lead_workspace(uuid), private.log_crm_change() from public, anon, authenticated;
grant execute on function private.customer_workspace(uuid), private.lead_workspace(uuid) to authenticated;

grant select, insert, update on public.customers, public.customer_contacts, public.leads, public.lead_activities, public.opportunities to authenticated;

create policy "crm staff read customers" on public.customers for select to authenticated using ((select private.has_permission('crm.read', workspace_id)) or (select private.has_permission('crm.write', workspace_id)));
create policy "crm staff write customers" on public.customers for insert to authenticated with check ((select private.has_permission('crm.write', workspace_id)));
create policy "crm staff update customers" on public.customers for update to authenticated using ((select private.has_permission('crm.write', workspace_id))) with check ((select private.has_permission('crm.write', workspace_id)));

create policy "crm staff read contacts" on public.customer_contacts for select to authenticated using ((select private.has_permission('crm.read', private.customer_workspace(customer_id))) or (select private.has_permission('crm.write', private.customer_workspace(customer_id))));
create policy "crm staff write contacts" on public.customer_contacts for insert to authenticated with check ((select private.has_permission('crm.write', private.customer_workspace(customer_id))));
create policy "crm staff update contacts" on public.customer_contacts for update to authenticated using ((select private.has_permission('crm.write', private.customer_workspace(customer_id)))) with check ((select private.has_permission('crm.write', private.customer_workspace(customer_id))));

create policy "crm staff read leads" on public.leads for select to authenticated using ((select private.has_permission('crm.read', workspace_id)) or (select private.has_permission('crm.write', workspace_id)));
create policy "crm staff write leads" on public.leads for insert to authenticated with check ((select private.has_permission('crm.write', workspace_id)));
create policy "crm staff update leads" on public.leads for update to authenticated using ((select private.has_permission('crm.write', workspace_id))) with check ((select private.has_permission('crm.write', workspace_id)));

create policy "crm staff read lead activities" on public.lead_activities for select to authenticated using ((select private.has_permission('crm.read', private.lead_workspace(lead_id))) or (select private.has_permission('crm.write', private.lead_workspace(lead_id))));
create policy "crm staff write lead activities" on public.lead_activities for insert to authenticated with check ((select private.has_permission('crm.write', private.lead_workspace(lead_id))) and created_by = (select auth.uid()));

create policy "crm staff read opportunities" on public.opportunities for select to authenticated using ((select private.has_permission('crm.read', workspace_id)) or (select private.has_permission('crm.write', workspace_id)));
create policy "crm staff write opportunities" on public.opportunities for insert to authenticated with check ((select private.has_permission('crm.write', workspace_id)));
create policy "crm staff update opportunities" on public.opportunities for update to authenticated using ((select private.has_permission('crm.write', workspace_id))) with check ((select private.has_permission('crm.write', workspace_id)));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['customers', 'customer_contacts', 'leads', 'lead_activities', 'opportunities']
  loop
    execute format('drop trigger if exists crm_audit_change on public.%I', table_name);
    execute format('create trigger crm_audit_change after insert or update on public.%I for each row execute procedure private.log_crm_change()', table_name);
  end loop;
end $$;
