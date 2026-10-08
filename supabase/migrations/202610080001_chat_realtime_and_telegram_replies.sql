-- Keep Telegram group replies inside the existing chat domain. The Edge Function
-- verifies the user's Supabase JWT, then calls these service-role-only RPCs.
create index if not exists chat_conversations_workspace_updated_idx
  on public.chat_conversations(workspace_id, updated_at desc);

create or replace function public.telegram_user_can_reply_to_group(
  profile_id_input uuid,
  conversation_id_input uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.telegram_group_bindings binding
      on binding.workspace_id = profile.workspace_id
     and binding.conversation_id = conversation_id_input
     and binding.is_active
    where profile.id = profile_id_input
      and profile.account_type = 'staff'
      and profile.is_active
      and coalesce(
        (
          select permission_override.is_allowed
          from public.user_permissions permission_override
          join public.permissions permission
            on permission.id = permission_override.permission_id
          where permission_override.user_id = profile.id
            and permission.code = 'chat.manage'
          limit 1
        ),
        exists (
          select 1
          from public.user_roles user_role
          join public.roles role on role.id = user_role.role_id
          join public.role_permissions role_permission on role_permission.role_id = role.id
          join public.permissions permission on permission.id = role_permission.permission_id
          where user_role.user_id = profile.id
            and permission.code = 'chat.manage'
            and role.role_type = 'staff'
            and (role.workspace_id is null or role.workspace_id = profile.workspace_id)
        )
      )
  );
$$;
revoke all on function public.telegram_user_can_reply_to_group(uuid, uuid) from public, anon, authenticated;
grant execute on function public.telegram_user_can_reply_to_group(uuid, uuid) to service_role;

create or replace function public.telegram_record_agent_group_reply(
  conversation_id_input uuid,
  actor_profile_id_input uuid,
  telegram_message_id_input bigint,
  body_input text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  binding public.telegram_group_bindings%rowtype;
  message_id_value uuid;
  body_value text := trim(coalesce(body_input, ''));
begin
  if coalesce(length(body_value), 0) < 1 or length(body_value) > 4000
     or telegram_message_id_input is null or telegram_message_id_input < 1
     or not public.telegram_user_can_reply_to_group(actor_profile_id_input, conversation_id_input) then
    raise exception 'This Telegram conversation is unavailable or you cannot reply.' using errcode = '42501';
  end if;

  select * into binding
  from public.telegram_group_bindings
  where conversation_id = conversation_id_input and is_active;
  if binding.id is null then
    raise exception 'This Telegram group is no longer connected.' using errcode = '42501';
  end if;

  insert into public.chat_messages(
    conversation_id, sender_profile_id, sender_kind, body, is_internal,
    telegram_group_chat_id, telegram_group_message_id, telegram_sender_label
  ) values (
    conversation_id_input, actor_profile_id_input, 'agent', body_value, true,
    binding.telegram_chat_id, telegram_message_id_input, 'Betanor staff'
  ) returning id into message_id_value;

  update public.chat_conversations set updated_at = now() where id = conversation_id_input;
  return message_id_value;
end;
$$;
revoke all on function public.telegram_record_agent_group_reply(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.telegram_record_agent_group_reply(uuid, uuid, bigint, text) to service_role;
