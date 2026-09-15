-- Demo passwords and anonymous RFQ intake are no longer exposed by the public API.
-- Customer RFQs use submit_customer_rfq and require a portal session.
revoke all on function public.get_demo_accounts() from public, anon, authenticated;
revoke all on function public.submit_public_rfq(text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
