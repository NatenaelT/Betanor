-- IT Support / Managed Support: uses canonical customers, contracts, projects,
-- employees, tasks, chat, documents and notifications.
begin;

insert into public.permissions (code, module, description) values
 ('support.read','support','Read support records'),
 ('support.view_all','support','View all support records'),
 ('support.create','support','Create support requests and tickets'),
 ('support.assign','support','Assign support tickets'),
 ('support.respond','support','Respond to assigned support tickets'),
 ('support.internal_note','support','Create technician-only internal activity notes'),
 ('support.manage_contracts','support','Manage support contracts and SLAs'),
 ('support.manage_assets','support','Manage customer support assets'),
 ('support.manage_schedule','support','Manage support schedule and visits'),
 ('support.view_reports','support','View support reports'),
 ('customer.support.read','customer_portal','Read own customer support records'),
 ('customer.support.create','customer_portal','Create support requests'),
 ('customer.support.respond','customer_portal','Reply to own support conversations')
on conflict (code) do nothing;

insert into public.roles (workspace_id, code, name, description, role_type, is_system)
select null, 'IT_SUPPORT_TECHNICIAN', 'IT Support Technician', 'Assigned ticket and service delivery access.', 'staff', true
where not exists (select 1 from public.roles where workspace_id is null and code='IT_SUPPORT_TECHNICIAN');

insert into public.role_permissions (role_id, permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.code='IT_SUPPORT_TECHNICIAN'
and p.code in ('support.read','support.respond') on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code in ('SUPER_ADMIN','ADMIN') and p.code like 'support.%'
on conflict do nothing;
insert into public.role_permissions(role_id, permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code in ('CUSTOMER_ADMIN','CUSTOMER_USER') and p.code like 'customer.support.%'
on conflict do nothing;

create table public.support_sla_policies (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null, first_response_minutes integer not null default 240 check(first_response_minutes>0),
 resolution_minutes integer not null default 2880 check(resolution_minutes>0), support_hours jsonb not null default '{}'::jsonb,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,name)
);
create table public.support_contracts (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete restrict, contract_id uuid references public.contracts(id) on delete set null,
 project_id uuid references public.projects(id) on delete set null, sla_id uuid references public.support_sla_policies(id) on delete set null,
 code text not null, title text not null, service_scope text[] not null default '{}', remote_support boolean not null default true,
 onsite_support boolean not null default true, status text not null default 'active' check(status in ('draft','active','suspended','expired','closed')),
 starts_on date, ends_on date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(workspace_id,code)
);
create table public.support_tickets (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 ticket_number text not null unique, customer_id uuid not null references public.customers(id) on delete restrict,
 contact_id uuid references public.customer_contacts(id) on delete set null, contract_id uuid references public.support_contracts(id) on delete set null,
 project_id uuid references public.projects(id) on delete set null, requester_profile_id uuid references public.profiles(id) on delete set null,
 assigned_employee_id uuid references public.employees(id) on delete set null, title text not null, description text not null,
 category text not null default 'General', priority text not null default 'normal' check(priority in ('low','normal','high','critical')),
 status text not null default 'New' check(status in ('New','Acknowledged','Assigned','In Progress','Waiting for Customer','Waiting for Internal Team','Scheduled Remote Session','Scheduled On-Site Visit','Resolved','Closed','Reopened','Cancelled')),
 source text not null default 'portal', first_response_due_at timestamptz, resolution_due_at timestamptz,
 resolved_at timestamptz, closed_at timestamptz, customer_confirmed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.support_ticket_events (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 actor_profile_id uuid references public.profiles(id) on delete set null, event_type text not null,
 body text not null, is_customer_visible boolean not null default false, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table public.support_sessions (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 session_type text not null check(session_type in ('remote','video','onsite')), starts_at timestamptz, ends_at timestamptz,
 provider text, secure_join_url text, status text not null default 'scheduled', work_log text,
 created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
create table public.support_assets (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade, project_id uuid references public.projects(id) on delete set null,
 asset_tag text not null, asset_type text not null, brand text, model text, serial_number text, location text,
 operating_system text, status text not null default 'active' check(status in ('active','repair','retired','lost')),
 installed_on date, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,asset_tag)
);
create table public.support_schedule_entries (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade, project_id uuid references public.projects(id) on delete set null,
 assigned_employee_id uuid references public.employees(id) on delete set null, title text not null, weekday smallint,
 starts_at time, ends_at time, scheduled_for timestamptz, location text, entry_type text not null default 'onsite',
 created_at timestamptz not null default now(), check(weekday is null or weekday between 0 and 6), check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create table public.support_lifecycle_records (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade, project_id uuid references public.projects(id) on delete set null,
 employee_name text not null, employee_email text, lifecycle_type text not null check(lifecycle_type in ('onboarding','offboarding')),
 status text not null default 'pending', due_on date, checklist jsonb not null default '[]'::jsonb,
 created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
create table public.support_task_links (
 task_id uuid primary key references public.tasks(id) on delete cascade,
 ticket_id uuid references public.support_tickets(id) on delete cascade,
 customer_id uuid references public.customers(id) on delete cascade,
 created_at timestamptz not null default now(), check(ticket_id is not null or customer_id is not null)
);
create table public.support_notification_preferences (
 profile_id uuid primary key references public.profiles(id) on delete cascade,
 in_app boolean not null default true, email boolean not null default false, telegram boolean not null default false
);
create table public.support_notification_outbox (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 profile_id uuid references public.profiles(id) on delete cascade, event_type text not null, channel text not null check(channel in ('email','telegram')),
 payload jsonb not null default '{}'::jsonb, status text not null default 'queued', created_at timestamptz not null default now()
);
create table public.support_reference_sequences (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 ref_year integer not null, last_value bigint not null default 0, primary key(workspace_id,ref_year)
);
alter table public.chat_conversations add column if not exists support_ticket_id uuid references public.support_tickets(id) on delete set null;

create or replace function private.next_support_ticket_number(p_workspace uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare y integer; n bigint;
begin
 y := extract(year from (now() at time zone coalesce((select timezone from public.workspaces where id=p_workspace),'Africa/Addis_Ababa')));
 insert into public.support_reference_sequences(workspace_id,ref_year,last_value) values(p_workspace,y,1)
 on conflict(workspace_id,ref_year) do update set last_value=public.support_reference_sequences.last_value+1
 returning last_value into n;
 return 'BTNR-TKT-'||y||'-'||lpad(n::text,5,'0');
end $$;
revoke all on function private.next_support_ticket_number(uuid) from public,anon,authenticated;

create or replace function private.support_ticket_before_insert()
returns trigger language plpgsql security definer set search_path=''
as $$ declare response_minutes integer; resolution_minutes integer; begin
 if new.ticket_number is null or new.ticket_number='' then new.ticket_number := private.next_support_ticket_number(new.workspace_id); end if;
 select p.first_response_minutes,p.resolution_minutes into response_minutes,resolution_minutes
 from public.support_contracts c left join public.support_sla_policies p on p.id=c.sla_id
 where c.id=new.contract_id and c.workspace_id=new.workspace_id and c.status='active';
 new.first_response_due_at := coalesce(new.first_response_due_at,now()+make_interval(mins=>coalesce(response_minutes,240)));
 new.resolution_due_at := coalesce(new.resolution_due_at,now()+make_interval(mins=>coalesce(resolution_minutes,2880)));
 return new;
end $$;
create trigger support_ticket_number_trigger before insert on public.support_tickets
for each row execute function private.support_ticket_before_insert();
revoke all on function private.support_ticket_before_insert() from public,anon,authenticated;

create or replace function private.support_ticket_after_insert()
returns trigger language plpgsql security definer set search_path=''
as $$
declare chat_id uuid;
begin
 insert into public.chat_conversations(workspace_id,reference,customer_id,topic,assigned_to,priority,status,support_ticket_id)
 values(new.workspace_id,'CHAT-'||new.ticket_number,new.customer_id,new.title,new.assigned_employee_id,
 (case new.priority when 'critical' then 'urgent' when 'high' then 'high' when 'low' then 'low' else 'medium' end)::public.priority_level,
 'waiting',new.id) returning id into chat_id;
 insert into public.chat_messages(conversation_id,sender_profile_id,sender_kind,body,is_internal)
 values(chat_id,new.requester_profile_id,case when new.requester_profile_id is null then 'system' else 'customer' end,new.description,false);
 insert into public.support_ticket_events(ticket_id,actor_profile_id,event_type,body,is_customer_visible)
 values(new.id,new.requester_profile_id,'ticket_created','Support request received.',true);
 return new;
end $$;
create trigger support_ticket_conversation_trigger after insert on public.support_tickets
for each row execute function private.support_ticket_after_insert();
revoke all on function private.support_ticket_after_insert() from public,anon,authenticated;

create or replace function private.support_ticket_notify()
returns trigger language plpgsql security definer set search_path=''
as $$
declare recipient uuid; ev text; msg text;
begin
 ev := case when tg_op='INSERT' then 'SUPPORT_REQUEST_RECEIVED' else 'SUPPORT_TICKET_UPDATED' end;
 msg := case when tg_op='INSERT' then 'Your support request '||new.ticket_number||' has been received.' else 'Ticket '||new.ticket_number||' status: '||new.status end;
 for recipient in
  select distinct candidate from unnest(array[new.requester_profile_id,(select e.profile_id from public.employees e where e.id=new.assigned_employee_id)]) candidate where candidate is not null
 loop
  if coalesce((select p.in_app from public.support_notification_preferences p where p.profile_id=recipient),true) then
   insert into public.notifications(recipient_id,type,title,body,entity_type,entity_id)
   values(recipient,ev,'Support ticket update',msg,'support_ticket',new.id);
  end if;
  if coalesce((select p.email from public.support_notification_preferences p where p.profile_id=recipient),false) then
   insert into public.support_notification_outbox(workspace_id,profile_id,event_type,channel,payload)
   values(new.workspace_id,recipient,ev,'email',jsonb_build_object('ticket_id',new.id,'ticket_number',new.ticket_number,'message',msg));
  end if;
  if coalesce((select p.telegram from public.support_notification_preferences p where p.profile_id=recipient),false) then
   insert into public.support_notification_outbox(workspace_id,profile_id,event_type,channel,payload)
   values(new.workspace_id,recipient,ev,'telegram',jsonb_build_object('ticket_id',new.id,'ticket_number',new.ticket_number,'message',msg));
  end if;
 end loop;
 if tg_op='INSERT' then
  for recipient in
   select distinct p.id from public.profiles p join public.user_roles ur on ur.user_id=p.id
   join public.roles r on r.id=ur.role_id join public.role_permissions rp on rp.role_id=r.id
   join public.permissions perm on perm.id=rp.permission_id
   where p.is_active and p.account_type='staff' and p.id is distinct from new.requester_profile_id
    and p.id is distinct from (select e.profile_id from public.employees e where e.id=new.assigned_employee_id)
    and perm.code in ('support.read','support.view_all')
    and (r.workspace_id is null or r.workspace_id=new.workspace_id)
  loop
   if coalesce((select pref.in_app from public.support_notification_preferences pref where pref.profile_id=recipient),true) then
    insert into public.notifications(recipient_id,type,title,body,entity_type,entity_id)
    values(recipient,'SUPPORT_NEW_TICKET','New support request',new.ticket_number||' · '||new.title,'support_ticket',new.id);
   end if;
   if coalesce((select pref.email from public.support_notification_preferences pref where pref.profile_id=recipient),false) then
    insert into public.support_notification_outbox(workspace_id,profile_id,event_type,channel,payload)
    values(new.workspace_id,recipient,'SUPPORT_NEW_TICKET','email',jsonb_build_object('ticket_id',new.id,'ticket_number',new.ticket_number));
   end if;
   if coalesce((select pref.telegram from public.support_notification_preferences pref where pref.profile_id=recipient),false) then
    insert into public.support_notification_outbox(workspace_id,profile_id,event_type,channel,payload)
    values(new.workspace_id,recipient,'SUPPORT_NEW_TICKET','telegram',jsonb_build_object('ticket_id',new.id,'ticket_number',new.ticket_number));
   end if;
  end loop;
 end if;
 return new;
end $$;
create trigger support_ticket_notifications after insert or update of status,assigned_employee_id on public.support_tickets
for each row execute function private.support_ticket_notify();
revoke all on function private.support_ticket_notify() from public,anon,authenticated;

create or replace function private.support_chat_notify()
returns trigger language plpgsql security definer set search_path=''
as $$ declare conversation public.chat_conversations%rowtype; ticket public.support_tickets%rowtype; recipient uuid; begin
 select * into conversation from public.chat_conversations where id=new.conversation_id;
 if conversation.support_ticket_id is null or new.sender_kind not in ('customer','agent') then return new; end if;
 select * into ticket from public.support_tickets where id=conversation.support_ticket_id;
 recipient := case when new.sender_kind='customer' then (select e.profile_id from public.employees e where e.id=ticket.assigned_employee_id) else ticket.requester_profile_id end;
 if recipient is null or recipient=new.sender_profile_id then return new; end if;
 if coalesce((select p.in_app from public.support_notification_preferences p where p.profile_id=recipient),true) then
  insert into public.notifications(recipient_id,type,title,body,entity_type,entity_id)
  values(recipient,'SUPPORT_CHAT_MESSAGE','New support message',ticket.ticket_number||' has a new reply.','support_ticket',ticket.id);
 end if;
 if coalesce((select p.email from public.support_notification_preferences p where p.profile_id=recipient),false) then
  insert into public.support_notification_outbox(workspace_id,profile_id,event_type,channel,payload)
  values(ticket.workspace_id,recipient,'SUPPORT_CHAT_MESSAGE','email',jsonb_build_object('ticket_id',ticket.id,'ticket_number',ticket.ticket_number,'message_id',new.id));
 end if;
 if coalesce((select p.telegram from public.support_notification_preferences p where p.profile_id=recipient),false) then
  insert into public.support_notification_outbox(workspace_id,profile_id,event_type,channel,payload)
  values(ticket.workspace_id,recipient,'SUPPORT_CHAT_MESSAGE','telegram',jsonb_build_object('ticket_id',ticket.id,'ticket_number',ticket.ticket_number,'message_id',new.id));
 end if;
 return new;
end $$;
create trigger support_chat_message_notifications after insert on public.chat_messages for each row execute function private.support_chat_notify();
revoke all on function private.support_chat_notify() from public,anon,authenticated;

create index support_tickets_workspace_status_created_idx on public.support_tickets(workspace_id,status,created_at desc);
create index support_tickets_assignee_due_idx on public.support_tickets(assigned_employee_id,resolution_due_at) where assigned_employee_id is not null;
create index support_tickets_customer_created_idx on public.support_tickets(customer_id,created_at desc);
create index support_tickets_contract_idx on public.support_tickets(contract_id) where contract_id is not null;
create index support_tickets_project_idx on public.support_tickets(project_id) where project_id is not null;
create index support_tickets_requester_idx on public.support_tickets(requester_profile_id,created_at desc) where requester_profile_id is not null;
create index support_contracts_customer_idx on public.support_contracts(customer_id,status);
create index support_events_ticket_created_idx on public.support_ticket_events(ticket_id,created_at desc);
create index support_events_actor_idx on public.support_ticket_events(actor_profile_id,created_at desc) where actor_profile_id is not null;
create index support_sessions_schedule_idx on public.support_sessions(starts_at) where status='scheduled';
create index support_sessions_ticket_idx on public.support_sessions(ticket_id,created_at desc);
create index support_assets_customer_status_idx on public.support_assets(customer_id,status);
create index support_assets_project_idx on public.support_assets(project_id) where project_id is not null;
create index support_schedule_assignee_idx on public.support_schedule_entries(assigned_employee_id,scheduled_for);
create index support_schedule_customer_idx on public.support_schedule_entries(customer_id,scheduled_for);
create index support_lifecycle_customer_idx on public.support_lifecycle_records(customer_id,due_on);
create index support_task_links_customer_idx on public.support_task_links(customer_id) where customer_id is not null;
create index support_task_links_ticket_idx on public.support_task_links(ticket_id) where ticket_id is not null;
create index support_outbox_delivery_idx on public.support_notification_outbox(status,created_at) where status='queued';
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_tickets') then alter publication supabase_realtime add table public.support_tickets; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_ticket_events') then alter publication supabase_realtime add table public.support_ticket_events; end if;
 end if;
end $$;

create or replace function private.support_can_access(p_customer uuid, p_workspace uuid, p_assignee uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select (select private.has_permission('support.view_all',p_workspace))
 or ((select private.has_permission('support.read',p_workspace)) and (p_assignee=(select e.id from public.employees e where e.profile_id=(select auth.uid()) and e.workspace_id=p_workspace)))
 or ((select private.customer_portal_has_access(p_customer)) and (select private.has_permission('customer.support.read',p_workspace)) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_type='customer')); $$;
revoke all on function private.support_can_access(uuid,uuid,uuid) from public,anon;
grant execute on function private.support_can_access(uuid,uuid,uuid) to authenticated;
create or replace function public.mark_chat_messages_read(conversation_id_input uuid)
returns integer language plpgsql security definer set search_path=''
as $$ declare actor_id uuid:=(select auth.uid()); workspace_value uuid; customer_value uuid; ticket_value uuid; changed integer; begin
 select c.workspace_id,c.customer_id,c.support_ticket_id into workspace_value,customer_value,ticket_value from public.chat_conversations c where c.id=conversation_id_input;
 if actor_id is null or workspace_value is null then raise exception 'Chat access is required.' using errcode='42501'; end if;
 if not ((customer_value is not null and private.customer_portal_has_access(customer_value))
  or private.has_permission('chat.manage',workspace_value)
  or (ticket_value is not null and (private.has_permission('support.respond',workspace_value) or private.has_permission('support.view_all',workspace_value))
   and exists(select 1 from public.support_tickets t where t.id=ticket_value and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id))))
 then raise exception 'You do not have access to this conversation.' using errcode='42501'; end if;
 update public.chat_messages set read_at=coalesce(read_at,now()) where conversation_id=conversation_id_input and sender_profile_id is distinct from actor_id;
 get diagnostics changed=row_count; return changed;
end $$;
revoke all on function public.mark_chat_messages_read(uuid) from public,anon;
grant execute on function public.mark_chat_messages_read(uuid) to authenticated;

do $$ declare t text; begin
 foreach t in array array['support_sla_policies','support_contracts','support_tickets','support_ticket_events','support_sessions','support_assets','support_schedule_entries','support_lifecycle_records','support_task_links','support_notification_preferences','support_notification_outbox'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('grant select, insert, update, delete on public.%I to authenticated',t);
 end loop;
end $$;
alter table public.support_reference_sequences enable row level security;
revoke all on public.support_reference_sequences from public,anon,authenticated;
create policy support_sla_read on public.support_sla_policies for select to authenticated using ((select private.has_permission('support.manage_contracts',workspace_id)) or (select private.has_permission('support.view_all',workspace_id)));
create policy support_sla_manage on public.support_sla_policies for all to authenticated using ((select private.has_permission('support.manage_contracts',workspace_id))) with check ((select private.has_permission('support.manage_contracts',workspace_id)));
create policy support_contract_access on public.support_contracts for select to authenticated using (
 (select private.has_permission('support.view_all',workspace_id))
 or ((select private.customer_portal_has_access(customer_id)) and (select private.has_permission('customer.support.read',workspace_id)) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_type='customer'))
 or ((select private.has_permission('support.read',workspace_id)) and exists(select 1 from public.support_tickets t join public.employees e on e.id=t.assigned_employee_id where t.contract_id=support_contracts.id and e.profile_id=(select auth.uid())))
);
create policy support_contract_manage on public.support_contracts for all to authenticated using ((select private.has_permission('support.manage_contracts',workspace_id))) with check ((select private.has_permission('support.manage_contracts',workspace_id)));
create policy support_ticket_select on public.support_tickets for select to authenticated using ((select private.support_can_access(customer_id,workspace_id,assigned_employee_id)));
create policy support_ticket_insert on public.support_tickets for insert to authenticated with check (
 (select private.has_permission('support.create',workspace_id))
 or (
  (select private.customer_portal_has_access(customer_id)) and (select private.has_permission('customer.support.create',workspace_id))
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_type='customer')
  and requester_profile_id=(select auth.uid()) and assigned_employee_id is null
  and exists(select 1 from public.customers c where c.id=customer_id and c.workspace_id=workspace_id)
  and (contract_id is null or exists(select 1 from public.support_contracts sc where sc.id=contract_id and sc.customer_id=customer_id and sc.workspace_id=workspace_id))
  and (project_id is null or exists(select 1 from public.projects p where p.id=project_id and p.customer_id=customer_id and p.workspace_id=workspace_id))
  and (contact_id is null or exists(select 1 from public.customer_contacts cc where cc.id=contact_id and cc.customer_id=customer_id))
 )
);
create policy support_ticket_update on public.support_tickets for update to authenticated using (
 (select private.has_permission('support.view_all',workspace_id)) or ((select private.has_permission('support.respond',workspace_id)) and private.support_can_access(customer_id,workspace_id,assigned_employee_id))
) with check ((select private.has_permission('support.view_all',workspace_id)) or (select private.has_permission('support.respond',workspace_id)));
create policy support_events_select on public.support_ticket_events for select to authenticated using (exists(select 1 from public.support_tickets t where t.id=ticket_id and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id) and (is_customer_visible or not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_type='customer'))));
revoke insert,update,delete on public.support_ticket_events from authenticated;
create policy support_sessions_read on public.support_sessions for select to authenticated using (exists(select 1 from public.support_tickets t where t.id=ticket_id and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id)));
create policy support_sessions_manage on public.support_sessions for all to authenticated using (exists(select 1 from public.support_tickets t where t.id=ticket_id and (private.has_permission('support.manage_schedule',t.workspace_id) or (private.has_permission('support.respond',t.workspace_id) and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id))))) with check (exists(select 1 from public.support_tickets t where t.id=ticket_id and (private.has_permission('support.manage_schedule',t.workspace_id) or (private.has_permission('support.respond',t.workspace_id) and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id)))));
create policy support_assets_read on public.support_assets for select to authenticated using ((select private.has_permission('support.view_all',workspace_id)) or ((select private.has_permission('support.read',workspace_id)) and exists(select 1 from public.support_contracts c where c.customer_id=support_assets.customer_id and c.workspace_id=support_assets.workspace_id)));
create policy support_assets_manage on public.support_assets for all to authenticated using ((select private.has_permission('support.manage_assets',workspace_id))) with check ((select private.has_permission('support.manage_assets',workspace_id)));
create policy support_schedule_read on public.support_schedule_entries for select to authenticated using ((select private.has_permission('support.view_all',workspace_id)) or assigned_employee_id=(select e.id from public.employees e where e.profile_id=(select auth.uid()) and e.workspace_id=support_schedule_entries.workspace_id) or ((select private.customer_portal_has_access(customer_id)) and (select private.has_permission('customer.support.read',workspace_id)) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_type='customer')));
create policy support_schedule_manage on public.support_schedule_entries for all to authenticated using ((select private.has_permission('support.manage_schedule',workspace_id))) with check ((select private.has_permission('support.manage_schedule',workspace_id)));
create policy support_lifecycle_read on public.support_lifecycle_records for select to authenticated using ((select private.has_permission('support.view_all',workspace_id)) or (select private.has_permission('support.manage_assets',workspace_id)));
create policy support_lifecycle_manage on public.support_lifecycle_records for all to authenticated using ((select private.has_permission('support.manage_assets',workspace_id))) with check ((select private.has_permission('support.manage_assets',workspace_id)));
create policy support_task_links_select on public.support_task_links for select to authenticated using (exists(select 1 from public.support_tickets t where t.id=ticket_id and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id)) or (select private.has_permission('support.view_all',null)));
create policy support_task_links_manage on public.support_task_links for all to authenticated using ((select private.has_permission('support.view_all',null)) or (select private.has_permission('support.assign',null))) with check ((select private.has_permission('support.view_all',null)) or (select private.has_permission('support.assign',null)));
create policy support_linked_task_read on public.tasks for select to authenticated using (
 exists(select 1 from public.support_task_links l join public.support_tickets t on t.id=l.ticket_id
  where l.task_id=tasks.id and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id))
);
create policy support_preferences_own on public.support_notification_preferences for all to authenticated using (profile_id=(select auth.uid())) with check (profile_id=(select auth.uid()));
create policy support_outbox_admin on public.support_notification_outbox for select to authenticated using ((select private.has_permission('support.view_reports',workspace_id)));
grant select on public.document_links,public.documents to authenticated;
create policy support_document_links_read on public.document_links for select to authenticated using (
 entity_type='support_ticket' and exists(select 1 from public.support_tickets t where t.id=entity_id and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id))
);
create policy support_documents_read on public.documents for select to authenticated using (
 exists(select 1 from public.document_links l join public.support_tickets t on t.id=l.entity_id where l.document_id=documents.id and l.entity_type='support_ticket' and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id))
);
create policy support_chat_conversation_read on public.chat_conversations for select to authenticated using (
 support_ticket_id is not null and exists(select 1 from public.support_tickets t where t.id=support_ticket_id and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id))
);
create policy support_chat_message_read on public.chat_messages for select to authenticated using (
 not is_internal and exists(select 1 from public.chat_conversations c join public.support_tickets t on t.id=c.support_ticket_id where c.id=conversation_id and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id))
);
create policy support_chat_message_insert on public.chat_messages for insert to authenticated with check (
 sender_profile_id=(select auth.uid()) and not is_internal and exists(
  select 1 from public.chat_conversations c join public.support_tickets t on t.id=c.support_ticket_id
  where c.id=conversation_id and ((private.customer_portal_has_access(t.customer_id) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_type='customer'))
   or ((private.has_permission('support.respond',t.workspace_id) or private.has_permission('support.view_all',t.workspace_id)) and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id)))
 )
);
drop policy if exists "customers read own conversations" on public.chat_conversations;
create policy "customers read own conversations" on public.chat_conversations for select to authenticated using (
 customer_id is not null and (select private.customer_portal_has_access(customer_id))
 and (support_ticket_id is null or (select private.has_permission('customer.support.read',workspace_id)))
);
drop policy if exists "customers read own public messages" on public.chat_messages;
create policy "customers read own public messages" on public.chat_messages for select to authenticated using (
 is_internal=false and exists(select 1 from public.chat_conversations c where c.id=chat_messages.conversation_id and c.customer_id is not null
  and (select private.customer_portal_has_access(c.customer_id)) and (c.support_ticket_id is null or (select private.has_permission('customer.support.read',c.workspace_id))))
);
drop policy if exists "customers send own messages" on public.chat_messages;
create policy "customers send own messages" on public.chat_messages for insert to authenticated with check (
 sender_kind='customer' and sender_profile_id=(select auth.uid()) and exists(select 1 from public.chat_conversations c where c.id=chat_messages.conversation_id and c.customer_id is not null
  and (select private.customer_portal_has_access(c.customer_id)) and (c.support_ticket_id is null or (select private.has_permission('customer.support.respond',c.workspace_id))))
);
drop policy if exists chat_attachment_upload_admin on storage.objects;
create policy chat_attachment_upload_admin on storage.objects for insert to authenticated with check (
 bucket_id='betanor-chat-attachments' and exists(select 1 from public.chat_conversations c where c.id=case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid else null end
  and ((select private.has_permission('chat.manage',c.workspace_id)) or (c.customer_id is not null and (select private.customer_portal_has_access(c.customer_id)) and (c.support_ticket_id is null or (select private.has_permission('customer.support.respond',c.workspace_id)))))
 )
);
drop policy if exists chat_attachment_read_authorized on storage.objects;
create policy chat_attachment_read_authorized on storage.objects for select to authenticated using (
 bucket_id='betanor-chat-attachments' and exists(select 1 from public.chat_messages m join public.chat_conversations c on c.id=m.conversation_id where m.attachment_path=storage.objects.name
  and ((select private.has_permission('chat.manage',c.workspace_id)) or (c.customer_id is not null and (select private.customer_portal_has_access(c.customer_id)) and (c.support_ticket_id is null or (select private.has_permission('customer.support.read',c.workspace_id)))))
 )
);
revoke delete on public.support_sessions from authenticated;
drop policy if exists support_chat_attachment_upload on storage.objects;
create policy support_chat_attachment_upload on storage.objects for insert to authenticated with check (
 bucket_id='betanor-chat-attachments' and exists(
  select 1 from public.chat_conversations c join public.support_tickets t on t.id=c.support_ticket_id
  where c.id=case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid else null end
   and ((private.has_permission('support.respond',t.workspace_id) and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id))
    or (private.customer_portal_has_access(t.customer_id) and private.has_permission('customer.support.respond',t.workspace_id)))
 )
);
drop policy if exists support_chat_attachment_read on storage.objects;
create policy support_chat_attachment_read on storage.objects for select to authenticated using (
 bucket_id='betanor-chat-attachments' and exists(
  select 1 from public.chat_messages m join public.chat_conversations c on c.id=m.conversation_id
  join public.support_tickets t on t.id=c.support_ticket_id
  where m.attachment_path=storage.objects.name and private.support_can_access(t.customer_id,t.workspace_id,t.assigned_employee_id)
 )
);

create or replace function public.assign_support_ticket(p_ticket uuid,p_employee uuid)
returns void language plpgsql security definer set search_path=''
as $$ declare t public.support_tickets%rowtype; begin
 if (select auth.uid()) is null then raise exception 'Sign in required.' using errcode='42501'; end if;
 select * into t from public.support_tickets where id=p_ticket for update;
 if t.id is null or not private.has_permission('support.assign',t.workspace_id) then raise exception 'Ticket assignment is not permitted.' using errcode='42501'; end if;
 if t.status in ('Closed','Cancelled') then raise exception 'A closed or cancelled ticket cannot be reassigned.' using errcode='22023'; end if;
 if not exists(select 1 from public.employees e where e.id=p_employee and e.workspace_id=t.workspace_id and e.employment_status='active') then raise exception 'Choose an active technician in this workspace.' using errcode='22023'; end if;
 update public.support_tickets set assigned_employee_id=p_employee,status=case when status='New' then 'Assigned' else status end,updated_at=now() where id=p_ticket;
 insert into public.support_ticket_events(ticket_id,actor_profile_id,event_type,body,metadata)
 values(p_ticket,(select auth.uid()),'ticket_assigned','Ticket assigned to technician.',jsonb_build_object('employee_id',p_employee));
end $$;
revoke all on function public.assign_support_ticket(uuid,uuid) from public,anon;
grant execute on function public.assign_support_ticket(uuid,uuid) to authenticated;

create or replace function public.support_list_technicians(p_workspace uuid)
returns table(id uuid,label text) language sql stable security definer set search_path=''
as $$ select e.id,concat_ws(' ',e.first_name,e.last_name) from public.employees e
 where e.workspace_id=p_workspace and e.employment_status='active'
 and private.has_permission('support.assign',p_workspace)
 order by e.first_name,e.last_name limit 200; $$;
revoke all on function public.support_list_technicians(uuid) from public,anon;
grant execute on function public.support_list_technicians(uuid) to authenticated;

create or replace function public.update_support_ticket_status(p_ticket uuid,p_status text,p_note text default null)
returns void language plpgsql security definer set search_path=''
as $$ declare t public.support_tickets%rowtype; actor uuid := (select auth.uid()); staff boolean; emp uuid; begin
 if actor is null or p_status not in ('Acknowledged','Assigned','In Progress','Waiting for Customer','Waiting for Internal Team','Scheduled Remote Session','Scheduled On-Site Visit','Resolved','Closed','Reopened','Cancelled') then raise exception 'Invalid status or sign-in required.' using errcode='22023'; end if;
 select * into t from public.support_tickets where id=p_ticket for update;
 select e.id into emp from public.employees e where e.profile_id=actor and e.workspace_id=t.workspace_id;
 staff := private.has_permission('support.view_all',t.workspace_id) or (private.has_permission('support.respond',t.workspace_id) and t.assigned_employee_id=emp);
 if t.id is null or not staff then raise exception 'You are not assigned or authorized to update this ticket.' using errcode='42501'; end if;
 if not (case t.status
  when 'New' then p_status in ('Acknowledged','Assigned','Cancelled')
  when 'Acknowledged' then p_status in ('Assigned','In Progress','Waiting for Customer','Waiting for Internal Team','Cancelled')
  when 'Assigned' then p_status in ('In Progress','Waiting for Customer','Waiting for Internal Team','Scheduled Remote Session','Scheduled On-Site Visit','Cancelled')
  when 'In Progress' then p_status in ('Waiting for Customer','Waiting for Internal Team','Scheduled Remote Session','Scheduled On-Site Visit','Resolved')
  when 'Waiting for Customer' then p_status in ('In Progress','Scheduled Remote Session','Scheduled On-Site Visit','Cancelled')
  when 'Waiting for Internal Team' then p_status in ('In Progress','Cancelled')
  when 'Scheduled Remote Session' then p_status in ('In Progress','Waiting for Customer','Resolved','Cancelled')
  when 'Scheduled On-Site Visit' then p_status in ('In Progress','Waiting for Customer','Resolved','Cancelled')
  when 'Resolved' then p_status in ('Closed','Reopened')
  when 'Reopened' then p_status in ('In Progress','Cancelled')
  else false end) then raise exception 'The requested support status transition is not permitted.' using errcode='22023'; end if;
 update public.support_tickets set status=p_status,resolved_at=case when p_status='Resolved' then now() when p_status='Reopened' then null else resolved_at end,closed_at=case when p_status='Closed' then now() else closed_at end,updated_at=now() where id=p_ticket;
 insert into public.support_ticket_events(ticket_id,actor_profile_id,event_type,body,is_customer_visible)
 values(p_ticket,actor,'status_changed',coalesce(nullif(trim(p_note),''),'Status changed to '||p_status||'.'),true);
end $$;
revoke all on function public.update_support_ticket_status(uuid,text,text) from public,anon;
grant execute on function public.update_support_ticket_status(uuid,text,text) to authenticated;

create or replace function public.confirm_support_ticket_resolution(p_ticket uuid)
returns void language plpgsql security definer set search_path=''
as $$ declare t public.support_tickets%rowtype; actor uuid := (select auth.uid()); begin
 select * into t from public.support_tickets where id=p_ticket for update;
 if actor is null or t.id is null or t.status<>'Resolved' or not private.customer_portal_has_access(t.customer_id) then raise exception 'A resolved ticket for your customer account is required.' using errcode='42501'; end if;
 update public.support_tickets set customer_confirmed_at=now(),status='Closed',closed_at=now(),updated_at=now() where id=p_ticket;
 insert into public.support_ticket_events(ticket_id,actor_profile_id,event_type,body,is_customer_visible)
 values(p_ticket,actor,'customer_confirmed','Customer confirmed resolution and closed the request.',true);
end $$;
revoke all on function public.confirm_support_ticket_resolution(uuid) from public,anon;
grant execute on function public.confirm_support_ticket_resolution(uuid) to authenticated;

-- Prevent direct customer updates of technician-owned ticket workflow fields.
revoke update on public.support_tickets from authenticated;
revoke update on public.support_tickets from anon;

-- Idempotent RTSL demonstration records; no Auth identity/password is written here.
do $$
declare w uuid; c uuid; p uuid; sla uuid; sc uuid; tech uuid;
begin
 select id into w from public.workspaces order by created_at limit 1;
 if w is null then return; end if;
 insert into public.customers(workspace_id,name,legal_name,email,metadata)
 select w,'RTSL','RTSL',null,jsonb_build_object('demo',true,'engagement','IT Support')
 where not exists(select 1 from public.customers where workspace_id=w and lower(name)='rtsl');
 select id into c from public.customers where workspace_id=w and name='RTSL' order by created_at limit 1;
 insert into public.projects(workspace_id,project_code,name,customer_id,description,status)
 values(w,'RTSL-IT-SUPPORT-DEMO','RTSL IT Support Engagement',c,
 'Remote and onsite managed IT support: Windows and Mac workstations, networking, telephony, video conferencing, endpoint security, deployment and employee lifecycle support.', 'in_progress')
 on conflict(project_code) do nothing;
 select id into p from public.projects where project_code='RTSL-IT-SUPPORT-DEMO';
 insert into public.support_sla_policies(workspace_id,name,first_response_minutes,resolution_minutes,support_hours)
 values(w,'RTSL Demonstration SLA',240,2880,jsonb_build_object('timezone','Africa/Addis_Ababa','weekly_onsite','Thursday 09:00-12:00'))
 on conflict(workspace_id,name) do nothing;
 select id into sla from public.support_sla_policies where workspace_id=w and name='RTSL Demonstration SLA';
 insert into public.support_contracts(workspace_id,customer_id,project_id,sla_id,code,title,service_scope)
 values(w,c,p,sla,'RTSL-SUP-DEMO-2026','RTSL IT Support Demonstration','{"remote support","onsite support","Windows and Mac","hardware and software troubleshooting","networking","video conferencing","telephony","asset lifecycle","workstation deployment","security configuration","updates","software installation","remote access","antivirus and remote management","onboarding and offboarding"}')
 on conflict(workspace_id,code) do nothing;
 select id into sc from public.support_contracts where workspace_id=w and code='RTSL-SUP-DEMO-2026';
 insert into public.employees(workspace_id,employee_number,first_name,last_name,work_email,hire_date,employment_status,metadata)
 select w,'DEMO-SUP-001','Support','Demo','support.demo@betanor.et',current_date,'active',jsonb_build_object('demo',true,'role_code','IT_SUPPORT_TECHNICIAN')
 where not exists(select 1 from public.employees e where e.workspace_id=w and e.work_email='support.demo@betanor.et');
 select id into tech from public.employees where workspace_id=w and work_email='support.demo@betanor.et' limit 1;
 insert into public.support_schedule_entries(workspace_id,customer_id,project_id,assigned_employee_id,title,weekday,starts_at,ends_at,location,entry_type)
 select w,c,p,tech,'RTSL weekly onsite support',4,'09:00','12:00','RTSL premises','onsite'
 where not exists(select 1 from public.support_schedule_entries where workspace_id=w and customer_id=c and title='RTSL weekly onsite support');
 insert into public.support_assets(workspace_id,customer_id,project_id,asset_tag,asset_type,brand,model,operating_system,location,notes)
 values(w,c,p,'RTSL-DEMO-LAP-001','Laptop','Dell','Latitude demonstration unit','Windows 11','RTSL office','Demo asset; replace details with verified inventory'),
 (w,c,p,'RTSL-DEMO-MAC-001','Workstation','Apple','Mac demonstration unit','macOS','RTSL office','Demo asset; replace details with verified inventory')
 on conflict(workspace_id,asset_tag) do nothing;
 insert into public.support_tickets(workspace_id,ticket_number,customer_id,contract_id,project_id,assigned_employee_id,title,description,category,priority,status,source)
 select w,'',c,sc,p,tech,title,description,category,priority,status,'demo'
 from (values
 ('001','Prepare Windows workstation deployment','Image device, apply approved security baseline, patch Windows and install licensed productivity tools.','Workstation deployment','normal','Assigned'),
 ('002','RTSL network connectivity investigation','Trace intermittent Wi-Fi connectivity and validate switch/AP uplinks during the next scheduled onsite visit.','Networking','high','In Progress'),
 ('003','Video conference room audio check','Validate camera, room microphone, display and meeting-client configuration.','Video conferencing','normal','New'),
 ('004','Mac remote-access and endpoint protection','Configure approved remote support and antivirus management on the macOS workstation.','Security configuration','normal','Waiting for Customer'),
 ('005','Employee account offboarding checklist','Disable managed access, recover assigned equipment and preserve business files under customer policy.','Onboarding/offboarding','high','Resolved')
 ) as d(suffix,title,description,category,priority,status)
 where not exists(select 1 from public.support_tickets t where t.workspace_id=w and t.customer_id=c and t.source='demo' and t.title=d.title);
 insert into public.tasks(workspace_id,project_id,title,description,status,priority,due_on)
 select w,p,d.title,d.description,d.status,d.priority,d.due_on from (values
  ('Provision Windows workstation image and baseline','Deploy and validate the RTSL Windows workstation setup.','in_progress'::public.task_status,'high'::public.priority_level,(current_date+3)),
  ('Review office network and Wi-Fi coverage','Document LAN/Wi-Fi findings and recommended remediation.','not_started'::public.task_status,'medium'::public.priority_level,(current_date+7)),
  ('Validate meeting-room video and telephony','Test room endpoint, conferencing and telephony with customer contact.','not_started'::public.task_status,'medium'::public.priority_level,(current_date+7)),
  ('Prepare managed asset onboarding checklist','Verify inventory, security baseline and user handover checklist.','not_started'::public.task_status,'low'::public.priority_level,(current_date+10))
 ) as d(title,description,status,priority,due_on)
 where not exists(select 1 from public.tasks t where t.workspace_id=w and t.project_id=p and t.title=d.title);
 insert into public.support_task_links(task_id,ticket_id,customer_id)
 select work.id,ticket.id,c from public.tasks work
 join public.support_tickets ticket on ticket.workspace_id=w and ticket.customer_id=c and ticket.source='demo'
 where work.workspace_id=w and work.project_id=p and work.title in ('Provision Windows workstation image and baseline','Review office network and Wi-Fi coverage','Validate meeting-room video and telephony','Prepare managed asset onboarding checklist')
 and ((work.title like 'Provision%' and ticket.title='Prepare Windows workstation deployment')
  or (work.title like 'Review%' and ticket.title='RTSL network connectivity investigation')
  or (work.title like 'Validate%' and ticket.title='Video conference room audio check')
  or (work.title like 'Prepare%' and ticket.title='Employee account offboarding checklist'))
 on conflict(task_id) do nothing;
 insert into public.support_lifecycle_records(workspace_id,customer_id,project_id,employee_name,employee_email,lifecycle_type,status,due_on,checklist)
 select w,c,p,'RTSL demo new starter','new.starter@example.invalid','onboarding','in_progress',current_date+5,'[{"item":"Workstation build","done":false},{"item":"Account/access request","done":false},{"item":"Security baseline","done":false}]'::jsonb
 where not exists(select 1 from public.support_lifecycle_records l where l.workspace_id=w and l.customer_id=c and l.employee_email='new.starter@example.invalid');
 insert into public.support_lifecycle_records(workspace_id,customer_id,project_id,employee_name,employee_email,lifecycle_type,status,due_on,checklist)
 select w,c,p,'RTSL demo departing user','departing.user@example.invalid','offboarding','pending',current_date+12,'[{"item":"Revoke managed access","done":false},{"item":"Recover assigned devices","done":false},{"item":"Preserve business files","done":false}]'::jsonb
 where not exists(select 1 from public.support_lifecycle_records l where l.workspace_id=w and l.customer_id=c and l.employee_email='departing.user@example.invalid');
end $$;

insert into public.support_ticket_events(ticket_id,event_type,body,is_customer_visible)
select t.id,'demo_seeded','RTSL demonstration ticket created with sample workflow history.',false
from public.support_tickets t where t.source='demo' and not exists(select 1 from public.support_ticket_events e where e.ticket_id=t.id and e.event_type='demo_seeded');
insert into public.support_ticket_events(ticket_id,event_type,body,is_customer_visible)
select t.id,'demo_work_log',case t.status
 when 'In Progress' then 'Technician began device/network diagnostics; findings and next actions are being recorded.'
 when 'Waiting for Customer' then 'Remote-access prerequisites were shared; awaiting the RTSL contact response.'
 when 'Resolved' then 'Demonstration work log: validation completed and customer confirmation is pending.'
 else 'Demonstration ticket is queued for triage and technician scheduling.' end,false
from public.support_tickets t where t.source='demo' and not exists(select 1 from public.support_ticket_events e where e.ticket_id=t.id and e.event_type='demo_work_log');
insert into public.support_sessions(ticket_id,session_type,starts_at,ends_at,provider,status,work_log)
select t.id,'remote',now()-interval '1 day',now()-interval '1 day'+interval '45 minutes','Customer-approved remote access','completed',
 'Demonstration work log: workstation health check, update status review and remote management connectivity verified.'
from public.support_tickets t where t.source='demo' and t.category='Security configuration'
and not exists(select 1 from public.support_sessions s where s.ticket_id=t.id and s.status='completed');

commit;
