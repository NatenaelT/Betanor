-- Allow a guest to safely continue a conversation without exposing chat tables.
create or replace function public.get_guest_chat(token_input text)
returns table(reference text, guest_name text, topic text, status text, message_id uuid, sender_kind text, body text, created_at timestamptz)
language sql security definer set search_path = '' as $$
  select c.reference, c.guest_name, c.topic, c.status, m.id, m.sender_kind, m.body, m.created_at
  from public.chat_conversations c
  join public.chat_messages m on m.conversation_id = c.id
  where c.secure_guest_token_hash = encode(extensions.digest(token_input, 'sha256'), 'hex')
    and length(coalesce(token_input, '')) >= 32
    and m.is_internal = false
  order by m.created_at asc;
$$;

create or replace function public.send_guest_chat_message(token_input text, message_input text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare conversation_id_value uuid;
begin
  if length(coalesce(token_input, '')) < 32 or length(trim(coalesce(message_input, ''))) < 2 then
    return false;
  end if;
  select id into conversation_id_value
  from public.chat_conversations
  where secure_guest_token_hash = encode(extensions.digest(token_input, 'sha256'), 'hex')
    and status not in ('closed', 'resolved');
  if conversation_id_value is null then return false; end if;
  insert into public.chat_messages(conversation_id, sender_kind, body)
  values (conversation_id_value, 'guest', trim(message_input));
  update public.chat_conversations set status = 'waiting', updated_at = now() where id = conversation_id_value;
  return true;
end; $$;

revoke all on function public.get_guest_chat(text) from public;
revoke all on function public.send_guest_chat_message(text, text) from public;
grant execute on function public.get_guest_chat(text) to anon, authenticated;
grant execute on function public.send_guest_chat_message(text, text) to anon, authenticated;
