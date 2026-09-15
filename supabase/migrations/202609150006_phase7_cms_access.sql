-- Phase 7: CMS access. Product catalogue editorial controls are introduced in Phase 8.

create or replace function private.log_cms_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (actor_id, entity_type, entity_id, action, payload)
  values (
    (select auth.uid()),
    tg_table_name,
    new.id,
    lower(tg_op),
    jsonb_build_object('slug', new.slug, 'status', new.status, 'published_at', new.published_at)
  );
  return new;
end;
$$;

revoke all on function private.log_cms_change() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['industries', 'services', 'case_studies', 'insights'] loop
    execute format('grant select, insert, update on public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.has_permission(''cms.read'', null)) or (select private.has_permission(''cms.write'', null)) or (select private.has_permission(''cms.publish'', null)))',
      'cms staff read', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.has_permission(''cms.write'', null)) and status = ''draft'' and published_at is null)',
      'cms writers create drafts', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.has_permission(''cms.write'', null)) and status = ''draft'') with check ((select private.has_permission(''cms.write'', null)) and status = ''draft'' and published_at is null)',
      'cms writers update drafts', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.has_permission(''cms.publish'', null))) with check ((select private.has_permission(''cms.publish'', null)))',
      'cms publishers manage release state', table_name
    );
    execute format('drop trigger if exists cms_audit_change on public.%I', table_name);
    execute format('create trigger cms_audit_change after insert or update on public.%I for each row execute procedure private.log_cms_change()', table_name);
  end loop;
end;
$$;
