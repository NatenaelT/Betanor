-- Customer portal authentication uses verified email addresses.
-- Phone remains optional contact data on profiles and customers.

alter table public.profiles add column if not exists email_address text;
create unique index if not exists profiles_email_address_uidx
  on public.profiles (lower(trim(email_address)))
  where email_address is not null and length(trim(email_address)) > 0;

update public.profiles p
set email_address = lower(trim(u.email))
from auth.users u
where u.id = p.id and u.email is not null and p.email_address is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email_address, phone_e164)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, new.phone),
    nullif(lower(trim(new.email)), ''),
    nullif(trim(new.phone), '')
  )
  on conflict (id) do update set
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    email_address = coalesce(public.profiles.email_address, excluded.email_address),
    phone_e164 = coalesce(public.profiles.phone_e164, excluded.phone_e164),
    updated_at = now();
  return new;
end;
$$;

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
  email_value text;
  phone_value text;
  name_value text;
  new_customer_id uuid;
begin
  if actor_id is null then raise exception 'Sign in is required.' using errcode = '28000'; end if;
  if coalesce(length(trim(company_name_input)), 0) < 2 then raise exception 'Company name is required.' using errcode = '22023'; end if;

  select lower(trim(u.email)), p.phone_e164, coalesce(nullif(trim(contact_name_input), ''), p.full_name)
    into email_value, phone_value, name_value
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = actor_id and p.is_active;
  if email_value is null then raise exception 'A verified email address is required.' using errcode = '22023'; end if;
  if exists (select 1 from public.customer_portal_access a where a.profile_id = actor_id and a.is_active) then
    raise exception 'This email already has a customer portal account.' using errcode = '23505';
  end if;
  select id into workspace_id_value from public.workspaces where slug = 'betanor' limit 1;
  if workspace_id_value is null then raise exception 'Customer onboarding is not configured.' using errcode = 'P0001'; end if;

  insert into public.customers (workspace_id, name, legal_name, email, phone, address, status, metadata)
  values (workspace_id_value, trim(company_name_input), trim(company_name_input), email_value, phone_value, nullif(trim(address_input), ''), 'active', jsonb_build_object('portal_self_registered', true, 'contact_name', coalesce(name_value, '')))
  returning id into new_customer_id;

  insert into public.customer_portal_access (workspace_id, customer_id, profile_id, access_level, is_active)
  values (workspace_id_value, new_customer_id, actor_id, 'customer_admin', true);
  return query select new_customer_id, trim(company_name_input);
end;
$$;

revoke all on function public.create_customer_portal_account(text, text, text, text) from public, anon;
grant execute on function public.create_customer_portal_account(text, text, text, text) to authenticated;
