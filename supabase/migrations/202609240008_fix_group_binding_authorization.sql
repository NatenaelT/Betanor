-- Service-role calls have no auth.uid(); authorize the verified actor explicitly.
create or replace function public.telegram_bind_group(
  telegram_chat_id_input text,
  telegram_username_input text,
  title_input text,
  actor_profile_id_input uuid
)
returns table(binding_id uuid, conversation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_id_value uuid;
  conversation_id_value uuid;
  binding_id_value uuid;
  binding_workspace_id uuid;
  reference_value text;
begin
  if telegram_chat_id_input !~ '^-?[0-9]{1,32}$'
     or actor_profile_id_input is null
     or coalesce(length(trim(title_input)), 0) < 1 then
    raise exception 'Invalid Telegram group details.' using errcode = '22023';
  end if;

  select profile.workspace_id into workspace_id_value
  from public.profiles profile
  where profile.id = actor_profile_id_input
    and profile.is_active
    and profile.account_type = 'staff';
  if workspace_id_value is null or not public.telegram_user_can_configure(actor_profile_id_input) then
    raise exception 'Only an authorized Betanor administrator can connect a Telegram group.' using errcode = '42501';
  end if;

  select binding.id, binding.conversation_id, binding.workspace_id into binding_id_value, conversation_id_value, binding_workspace_id
  from public.telegram_group_bindings binding
  where binding.telegram_chat_id = telegram_chat_id_input
  for update;

  if binding_id_value is not null and binding_workspace_id is distinct from workspace_id_value then
    raise exception 'This Telegram group is already connected to another workspace.' using errcode = '42501';
  end if;

  if binding_id_value is null then
    reference_value := 'TG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    insert into public.chat_conversations(workspace_id, reference, guest_name, topic, status, priority)
    values (
      workspace_id_value,
      reference_value,
      'Telegram group · ' || coalesce(nullif(trim(telegram_username_input), ''), trim(title_input)),
      'Employee team conversation mirrored from Telegram.',
      'open',
      'medium'
    ) returning id into conversation_id_value;

    insert into public.telegram_group_bindings(
      workspace_id, telegram_chat_id, telegram_username, title, conversation_id, linked_by
    ) values (
      workspace_id_value,
      telegram_chat_id_input,
      nullif(lower(regexp_replace(trim(coalesce(telegram_username_input, '')), '^@', '')), ''),
      trim(title_input),
      conversation_id_value,
      actor_profile_id_input
    ) returning id into binding_id_value;
  else
    update public.telegram_group_bindings binding
    set telegram_username = nullif(lower(regexp_replace(trim(coalesce(telegram_username_input, '')), '^@', '')), ''),
        title = trim(title_input),
        is_active = true,
        linked_by = actor_profile_id_input,
        updated_at = now()
    where binding.id = binding_id_value;
    update public.chat_conversations conversation
    set guest_name = 'Telegram group · ' || coalesce(nullif(trim(telegram_username_input), ''), trim(title_input)),
        status = 'open',
        updated_at = now()
    where conversation.id = conversation_id_value;
  end if;

  return query select binding_id_value, conversation_id_value;
end;
$$;
revoke all on function public.telegram_bind_group(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.telegram_bind_group(text, text, text, uuid) to service_role;
