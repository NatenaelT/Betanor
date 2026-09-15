create or replace function public.start_guest_chat(name_input text, email_input text, topic_input text, message_input text)
returns table(token text, reference text) language plpgsql security definer set search_path = '' as $$
declare workspace_id_value uuid; conversation_id uuid; raw_token text; chat_reference text;
begin
  if coalesce(length(trim(name_input)),0)<2 or coalesce(length(trim(message_input)),0)<2 then raise exception 'Name and message are required.' using errcode='22023'; end if;
  select id into workspace_id_value from public.workspaces where slug='betanor';
  raw_token:=encode(gen_random_bytes(32),'hex'); chat_reference:=format('BTNR-CHAT-%s-%s',to_char(current_date,'YYYY'),upper(substr(replace(gen_random_uuid()::text,'-',''),1,5)));
  insert into public.chat_conversations(workspace_id,reference,guest_name,guest_email,topic,secure_guest_token_hash,status) values(workspace_id_value,chat_reference,trim(name_input),nullif(lower(trim(email_input)),''),nullif(trim(topic_input),''),encode(extensions.digest(raw_token,'sha256'),'hex'),'waiting') returning id into conversation_id;
  insert into public.chat_messages(conversation_id,sender_kind,body) values(conversation_id,'guest',trim(message_input));
  return query select raw_token,chat_reference;
end; $$;
revoke all on function public.start_guest_chat(text,text,text,text) from public;
grant execute on function public.start_guest_chat(text,text,text,text) to anon,authenticated;
grant select,insert on public.chat_conversations,public.chat_messages to authenticated;
create policy "chat agents read conversations" on public.chat_conversations for select to authenticated using ((select private.has_permission('chat.manage',workspace_id)));
create policy "chat agents read messages" on public.chat_messages for select to authenticated using (exists(select 1 from public.chat_conversations c where c.id=chat_messages.conversation_id and (select private.has_permission('chat.manage',c.workspace_id))));
create policy "chat agents send messages" on public.chat_messages for insert to authenticated with check (sender_kind='agent' and sender_profile_id=(select auth.uid()) and exists(select 1 from public.chat_conversations c where c.id=chat_messages.conversation_id and (select private.has_permission('chat.manage',c.workspace_id))));
