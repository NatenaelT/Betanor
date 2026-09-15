-- Phase 8: Product catalogue editorial access.
-- The tables already exist; this migration gives them the same controlled
-- draft/publish model used by the Phase 7 CMS collections.

grant select, insert, update on public.product_categories, public.products to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['product_categories', 'products']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.has_permission(''cms.read'', null)) or (select private.has_permission(''cms.write'', null)) or (select private.has_permission(''cms.publish'', null)))',
      'catalogue staff read', table_name
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.has_permission(''cms.write'', null)) and status = ''draft'' and published_at is null)',
      'catalogue writers create drafts', table_name
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.has_permission(''cms.write'', null)) and status = ''draft'') with check ((select private.has_permission(''cms.write'', null)) and status = ''draft'' and published_at is null)',
      'catalogue writers update drafts', table_name
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.has_permission(''cms.publish'', null))) with check ((select private.has_permission(''cms.publish'', null)))',
      'catalogue publishers manage release state', table_name
    );

    execute format('drop trigger if exists catalogue_audit_change on public.%I', table_name);
    execute format('create trigger catalogue_audit_change after insert or update on public.%I for each row execute procedure private.log_cms_change()', table_name);
  end loop;
end $$;
