alter table public.quotations add column if not exists share_token_hash text unique;
alter table public.quotations add column if not exists share_expires_at timestamptz;

create or replace function public.get_shared_quotation(token_input text)
returns table(quotation_number text, title text, subtotal numeric, tax_amount numeric, total_amount numeric, currency_code text, vat_rate numeric, tax_inclusive boolean, payment_terms text, delivery_terms text, place_of_supply text, expires_on date, accepted_at timestamptz)
language sql security definer set search_path = '' as $$
  select quotation_number, title, subtotal, tax_amount, total_amount, currency_code, vat_rate, tax_inclusive, payment_terms, delivery_terms, place_of_supply, expires_on, accepted_at
  from public.quotations
  where share_token_hash = encode(extensions.digest(token_input, 'sha256'), 'hex')
    and status = 'approved'
    and (share_expires_at is null or share_expires_at > now());
$$;

create or replace function public.accept_shared_quotation(token_input text, accepted_by_input text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(length(trim(accepted_by_input)), 0) < 2 then raise exception 'A full acceptance name is required.' using errcode = '22023'; end if;
  update public.quotations set accepted_at = now(), client_acceptance_name = trim(accepted_by_input), client_acceptance_timestamp = now()
  where share_token_hash = encode(extensions.digest(token_input, 'sha256'), 'hex') and status = 'approved' and accepted_at is null and (share_expires_at is null or share_expires_at > now());
  return found;
end; $$;

revoke all on function public.get_shared_quotation(text), public.accept_shared_quotation(text, text) from public;
grant execute on function public.get_shared_quotation(text), public.accept_shared_quotation(text, text) to anon, authenticated;
