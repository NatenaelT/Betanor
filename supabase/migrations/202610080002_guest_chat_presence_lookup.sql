-- Let a guest prove ownership with their high-entropy chat token and learn
-- only the conversation ID needed to subscribe to that conversation's
-- Supabase Realtime presence topic. No chat content or other guest data is
-- exposed by this function.
create index if not exists chat_conversations_guest_token_hash_idx
  on public.chat_conversations (secure_guest_token_hash)
  where secure_guest_token_hash is not null;

create or replace function public.get_guest_chat_session(token_input text)
returns table(conversation_id uuid, conversation_status text)
language sql
security definer
set search_path = ''
as $$
  select c.id, c.status
  from public.chat_conversations as c
  where token_input ~ '^[0-9a-fA-F]{64}$'
    and c.secure_guest_token_hash = encode(extensions.digest(token_input, 'sha256'), 'hex')
  limit 1;
$$;

revoke all on function public.get_guest_chat_session(text) from public, anon, authenticated;
grant execute on function public.get_guest_chat_session(text) to anon, authenticated;
