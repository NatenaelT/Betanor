-- Customer identity, authenticated portal onboarding, and live customer updates.
-- Phone numbers are stored as the Supabase Auth E.164 value and are unique for
-- both the application profile and customer account.

alter table public.customer_portal_access enable row level security;

alter table public.profiles add column if not exists phone_e164 text;
create unique index if not exists profiles_phone_e164_uidx
  on public.profiles (phone_e164)
  where phone_e164 is not null and length(trim(phone_e164)) > 0;
create unique index if not exists customers_phone_uidx
  on public.customers (lower(trim(phone)))
  where phone is not null and length(trim(phone)) > 0;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone_e164)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, new.phone),
    nullif(trim(new.phone), '')
  )
  on conflict (id) do update set
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    phone_e164 = coalesce(public.profiles.phone_e164, excluded.phone_e164),
    updated_at = now();
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.create_customer_portal_account(
  company_name_input text,
  contact_name_input text,
  email_input text,
  address_input text default null
)
returns table(customer_id uuid, customer_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  workspace_id_value uuid;
  phone_value text;
  name_value text;
  new_customer_id uuid;
begin
  if actor_id is null then raise exception 'Sign in is required.' using errcode = '28000'; end if;
  if coalesce(length(trim(company_name_input)), 0) < 2 then raise exception 'Company name is required.' using errcode = '22023'; end if;

  select p.phone_e164, coalesce(nullif(trim(contact_name_input), ''), p.full_name)
    into phone_value, name_value
  from public.profiles p where p.id = actor_id and p.is_active;
  if phone_value is null then raise exception 'A verified phone number is required.' using errcode = '22023'; end if;
  if exists (select 1 from public.customer_portal_access a where a.profile_id = actor_id and a.is_active) then
    raise exception 'This phone number already has a customer portal account.' using errcode = '23505';
  end if;
  select id into workspace_id_value from public.workspaces where slug = 'betanor' limit 1;
  if workspace_id_value is null then raise exception 'Customer onboarding is not configured.' using errcode = 'P0001'; end if;

  insert into public.customers (workspace_id, name, legal_name, email, phone, address, status, metadata)
  values (workspace_id_value, trim(company_name_input), trim(company_name_input), nullif(lower(trim(email_input)), ''), phone_value, nullif(trim(address_input), ''), 'active', jsonb_build_object('portal_self_registered', true, 'contact_name', coalesce(name_value, '')))
  returning id into new_customer_id;

  insert into public.customer_portal_access (workspace_id, customer_id, profile_id, access_level, is_active)
  values (workspace_id_value, new_customer_id, actor_id, 'customer_admin', true);
  return query select new_customer_id, trim(company_name_input);
end;
$$;
revoke all on function public.create_customer_portal_account(text, text, text, text) from public, anon;
grant execute on function public.create_customer_portal_account(text, text, text, text) to authenticated;

create or replace function public.submit_customer_rfq(
  requester_name_input text,
  requester_phone_input text,
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
  actor_id uuid := (select auth.uid());
  customer_id_value uuid;
  workspace_id_value uuid;
  new_rfq_id uuid;
  new_reference text;
  item jsonb;
begin
  if actor_id is null then raise exception 'Sign in is required.' using errcode = '28000'; end if;
  if coalesce(length(trim(requirements_input)), 0) < 10 then raise exception 'Please describe at least 10 characters of requirements.' using errcode = '22023'; end if;
  select a.customer_id, a.workspace_id into customer_id_value, workspace_id_value
    from public.customer_portal_access a where a.profile_id = actor_id and a.is_active limit 1;
  if customer_id_value is null then raise exception 'Complete customer onboarding before submitting an RFQ.' using errcode = '42501'; end if;
  new_reference := format('BTNR-RFQ-%s-%s', to_char(current_date, 'YYYY'), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)));
  insert into public.rfq_requests (workspace_id, reference, customer_id, requester_name, requester_email, requester_phone, organization, request_type, requirements, timeline, status)
  select workspace_id_value, new_reference, customer_id_value, coalesce(nullif(trim(requester_name_input), ''), p.full_name, 'Customer'), u.email, coalesce(nullif(trim(requester_phone_input), ''), p.phone_e164), c.name, nullif(trim(request_type_input), ''), trim(requirements_input), nullif(trim(timeline_input), ''), 'submitted'
  from public.profiles p join auth.users u on u.id = p.id join public.customers c on c.id = customer_id_value
  where p.id = actor_id
  returning id into new_rfq_id;
  for item in select value from jsonb_array_elements(coalesce(items_input, '[]'::jsonb)) loop
    if length(trim(coalesce(item ->> 'description', ''))) between 2 and 500 then
      insert into public.rfq_items (rfq_id, description, quantity, unit, specifications)
      values (new_rfq_id, trim(item ->> 'description'), greatest(coalesce(nullif(item ->> 'quantity', '')::numeric, 1), 1), nullif(trim(item ->> 'unit'), ''), coalesce(item -> 'specifications', '{}'::jsonb));
    end if;
  end loop;
  return query select new_reference;
end;
$$;
revoke all on function public.submit_customer_rfq(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.submit_customer_rfq(text, text, text, text, text, jsonb) to authenticated;

create or replace function public.submit_public_contact_request(
  name_input text,
  email_input text,
  phone_input text default null,
  organization_input text default null,
  topic_input text default null,
  requirements_input text default null
)
returns table(request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare workspace_id_value uuid; new_id uuid;
begin
  if coalesce(length(trim(name_input)), 0) < 2 or coalesce(length(trim(email_input)), 0) < 5 or position('@' in email_input) = 0 then
    raise exception 'Please provide a valid name and email address.' using errcode = '22023';
  end if;
  select id into workspace_id_value from public.workspaces where slug = 'betanor' limit 1;
  insert into public.consultation_requests (workspace_id, name, organization, email, phone, topic, requirements, status)
  values (workspace_id_value, trim(name_input), nullif(trim(organization_input), ''), lower(trim(email_input)), nullif(trim(phone_input), ''), nullif(trim(topic_input), ''), nullif(trim(requirements_input), ''), 'submitted')
  returning id into new_id;
  return query select new_id;
end;
$$;
revoke all on function public.submit_public_contact_request(text, text, text, text, text, text) from public;
grant execute on function public.submit_public_contact_request(text, text, text, text, text, text) to anon, authenticated;

alter table public.chat_messages drop constraint if exists chat_messages_sender_kind_check;
alter table public.chat_messages add constraint chat_messages_sender_kind_check check (sender_kind = any (array['guest'::text, 'customer'::text, 'agent'::text, 'system'::text]));

create or replace function public.start_customer_chat(topic_input text, message_input text)
returns table(conversation_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid()); customer_id_value uuid; workspace_id_value uuid; conversation_id_value uuid; reference_value text; display_name text;
begin
  if actor_id is null or coalesce(length(trim(message_input)), 0) < 2 then raise exception 'A message is required.' using errcode = '22023'; end if;
  select a.customer_id, a.workspace_id into customer_id_value, workspace_id_value from public.customer_portal_access a where a.profile_id = actor_id and a.is_active limit 1;
  if customer_id_value is null then raise exception 'Customer portal access is required.' using errcode = '42501'; end if;
  select coalesce(p.full_name, c.name) into display_name from public.profiles p join public.customers c on c.id = customer_id_value where p.id = actor_id;
  select id, reference into conversation_id_value, reference_value from public.chat_conversations where customer_id = customer_id_value and status not in ('closed', 'resolved') order by updated_at desc limit 1;
  if conversation_id_value is null then
    reference_value := format('BTNR-CHAT-%s-%s', to_char(current_date, 'YYYY'), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)));
    insert into public.chat_conversations (workspace_id, customer_id, reference, guest_name, topic, status) values (workspace_id_value, customer_id_value, reference_value, display_name, nullif(trim(topic_input), ''), 'waiting') returning id into conversation_id_value;
  end if;
  insert into public.chat_messages (conversation_id, sender_profile_id, sender_kind, body) values (conversation_id_value, actor_id, 'customer', trim(message_input));
  update public.chat_conversations set status = 'waiting', updated_at = now() where id = conversation_id_value;
  return query select conversation_id_value, reference_value;
end;
$$;
revoke all on function public.start_customer_chat(text, text) from public, anon;
grant execute on function public.start_customer_chat(text, text) to authenticated;

create policy "customers read own conversations" on public.chat_conversations for select to authenticated
  using (customer_id is not null and (select private.customer_portal_has_access(customer_id)));
create policy "customers read own public messages" on public.chat_messages for select to authenticated
  using (is_internal = false and exists (select 1 from public.chat_conversations c where c.id = chat_messages.conversation_id and c.customer_id is not null and (select private.customer_portal_has_access(c.customer_id))));
create policy "customers send own messages" on public.chat_messages for insert to authenticated
  with check (sender_kind = 'customer' and sender_profile_id = (select auth.uid()) and exists (select 1 from public.chat_conversations c where c.id = chat_messages.conversation_id and c.customer_id is not null and (select private.customer_portal_has_access(c.customer_id))));

do $$
declare table_name text;
begin
  foreach table_name in array array['customer_portal_access','rfq_requests','quotations','contracts','projects','invoices','chat_conversations','chat_messages'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
