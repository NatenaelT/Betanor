-- Customer notification paging must recheck current ticket access. Old support
-- notifications remain in the database when organization access is revoked,
-- but must not remain visible in the customer portal.
create or replace function public.noren_customer_notification_page(
  page_input integer default 1,
  limit_input integer default 20,
  unread_only boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or page_input < 1 or page_input > 10000
     or limit_input < 1 or limit_input > 30 then
    raise exception 'Invalid notification page.' using errcode = '22023';
  end if;

  with visible as materialized (
    select n.id, n.type, n.title, n.body, n.entity_type, n.entity_id,
           n.read_at, n.created_at
    from public.notifications n
    join public.support_tickets ticket
      on n.entity_type = 'support_ticket' and n.entity_id = ticket.id
    where n.recipient_id = (select auth.uid())
      and exists (
        select 1 from public.customer_portal_access access
        where access.profile_id = (select auth.uid())
          and access.customer_id = ticket.customer_id
          and access.is_active
      )
  ), filtered as (
    select * from visible where not unread_only or read_at is null
  ), page_rows as (
    select * from filtered order by created_at desc, id desc
    limit limit_input offset (page_input - 1) * limit_input
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(row) order by row.created_at desc, row.id desc) from page_rows row), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'unreadCount', (select count(*) from visible where read_at is null)
  ) into result;
  return result;
end;
$$;

revoke all on function public.noren_customer_notification_page(integer, integer, boolean) from public, anon;
grant execute on function public.noren_customer_notification_page(integer, integer, boolean) to authenticated;
