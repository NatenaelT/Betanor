-- Remove the legacy typo/duplicate from the public catalogue while preserving it
-- for audit history. The canonical maintenance service has its own stable slug.
update public.services
set status = 'archived', published_at = null, updated_at = now()
where slug = 'm';
