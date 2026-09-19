-- pgcrypto functions live in Supabase's extensions schema. These functions run
-- with an empty search_path, so every crypto call must be schema-qualified.
create or replace function public.start_guest_chat(name_input text, email_input text, topic_input text, message_input text)
returns table(token text, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_id_value uuid;
  conversation_id uuid;
  raw_token text;
  chat_reference text;
begin
  if coalesce(length(trim(name_input)), 0) < 2 or coalesce(length(trim(message_input)), 0) < 2 then
    raise exception 'Name and message are required.' using errcode = '22023';
  end if;

  select id into workspace_id_value from public.workspaces where slug = 'betanor' limit 1;
  if workspace_id_value is null then
    raise exception 'Betanor workspace is not configured.' using errcode = 'P0001';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  chat_reference := format(
    'BTNR-CHAT-%s-%s',
    to_char(current_date, 'YYYY'),
    upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 5))
  );

  insert into public.chat_conversations (
    workspace_id, reference, guest_name, guest_email, topic,
    secure_guest_token_hash, status
  ) values (
    workspace_id_value,
    chat_reference,
    trim(name_input),
    nullif(lower(trim(email_input)), ''),
    nullif(trim(topic_input), ''),
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    'waiting'
  ) returning id into conversation_id;

  insert into public.chat_messages (conversation_id, sender_kind, body)
  values (conversation_id, 'guest', trim(message_input));

  return query select raw_token, chat_reference;
end;
$$;

revoke all on function public.start_guest_chat(text, text, text, text) from public;
grant execute on function public.start_guest_chat(text, text, text, text) to anon, authenticated;

-- These support the most common customer/chat and public content lookups.
create index if not exists chat_conversations_customer_updated_idx
  on public.chat_conversations (customer_id, updated_at desc)
  where customer_id is not null;
create index if not exists chat_conversations_workspace_status_updated_idx
  on public.chat_conversations (workspace_id, status, updated_at desc);
create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at asc);
create index if not exists customers_workspace_name_idx
  on public.customers (workspace_id, name);
