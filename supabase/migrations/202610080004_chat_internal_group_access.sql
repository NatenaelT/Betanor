-- Let staff with internal-chat access use staff groups and direct threads.
-- Customer support remains restricted to chat managers; direct threads stay
-- participant-scoped.

drop policy if exists "chat agents read conversations" on public.chat_conversations;
create policy "chat agents read conversations"
  on public.chat_conversations for select to authenticated
  using (
    (conversation_type = 'customer_support'
      and private.has_permission('chat.manage', workspace_id))
    or (conversation_type in ('staff_group', 'telegram_group')
      and (private.has_permission('chat.manage', workspace_id)
        or private.has_permission('chat.internal.read', workspace_id))
      and private.is_active_staff_profile((select auth.uid())))
    or (conversation_type = 'staff_direct'
      and (private.has_permission('chat.manage', workspace_id)
        or private.has_permission('chat.internal.read', workspace_id))
      and private.chat_is_conversation_participant(id, (select auth.uid())))
  );

drop policy if exists "chat agents read messages" on public.chat_messages;
create policy "chat agents read messages"
  on public.chat_messages for select to authenticated
  using (
    exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = chat_messages.conversation_id
        and (
          (conversation.conversation_type = 'customer_support'
            and private.has_permission('chat.manage', conversation.workspace_id))
          or (conversation.conversation_type in ('staff_group', 'telegram_group')
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.is_active_staff_profile((select auth.uid())))
          or (conversation.conversation_type = 'staff_direct'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
        )
    )
  );

drop policy if exists "chat agents send messages" on public.chat_messages;
create policy "chat agents send messages"
  on public.chat_messages for insert to authenticated
  with check (
    sender_kind = 'agent'
    and sender_profile_id = (select auth.uid())
    and exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = chat_messages.conversation_id
        and conversation.deleted_at is null
        and (
          (conversation.conversation_type = 'customer_support'
            and private.has_permission('chat.manage', conversation.workspace_id))
          or (conversation.conversation_type = 'staff_group'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.is_active_staff_profile((select auth.uid())))
          or (conversation.conversation_type = 'telegram_group'
            and private.has_permission('chat.manage', conversation.workspace_id))
          or (conversation.conversation_type = 'staff_direct'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
        )
    )
  );

create or replace function private.chat_message_actor_can_change(p_message public.chat_messages)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_message.sender_profile_id = (select auth.uid())
    and p_message.sender_kind in ('agent', 'customer')
    and p_message.deleted_at is null
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid()) and profile.is_active
    )
    and exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = p_message.conversation_id
        and conversation.deleted_at is null
        and (
          (p_message.sender_kind = 'agent'
            and (
              (private.has_permission('chat.manage', conversation.workspace_id)
                and (conversation.conversation_type <> 'staff_direct'
                  or private.chat_is_conversation_participant(conversation.id, (select auth.uid()))))
              or (private.has_permission('chat.internal.read', conversation.workspace_id)
                and private.is_active_staff_profile((select auth.uid()))
                and (conversation.conversation_type = 'staff_group'
                  or (conversation.conversation_type = 'staff_direct'
                    and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))))
            ))
          or (p_message.sender_kind = 'customer'
            and conversation.customer_id is not null
            and private.customer_portal_has_access(conversation.customer_id))
        )
    );
$$;
revoke all on function private.chat_message_actor_can_change(public.chat_messages) from public, anon;
grant execute on function private.chat_message_actor_can_change(public.chat_messages) to authenticated;

drop policy if exists chat_attachment_upload_admin on storage.objects;
create policy chat_attachment_upload_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'betanor-chat-attachments'
    and exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = case
        when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid
        else null
      end
        and conversation.deleted_at is null
        and (
          (conversation.conversation_type = 'customer_support'
            and private.has_permission('chat.manage', conversation.workspace_id))
          or (conversation.conversation_type in ('staff_group', 'telegram_group')
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.is_active_staff_profile((select auth.uid())))
          or (conversation.conversation_type = 'staff_direct'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
          or (conversation.customer_id is not null
            and private.customer_portal_has_access(conversation.customer_id)
            and (conversation.support_ticket_id is null
              or private.has_permission('customer.support.respond', conversation.workspace_id)))
        )
    )
  );

drop policy if exists chat_attachment_read_authorized on storage.objects;
create policy chat_attachment_read_authorized on storage.objects
  for select to authenticated
  using (
    bucket_id = 'betanor-chat-attachments'
    and exists (
      select 1
      from public.chat_messages message
      join public.chat_conversations conversation on conversation.id = message.conversation_id
      where message.attachment_path = storage.objects.name
        and (
          (conversation.conversation_type = 'customer_support'
            and private.has_permission('chat.manage', conversation.workspace_id))
          or (conversation.conversation_type in ('staff_group', 'telegram_group')
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.is_active_staff_profile((select auth.uid())))
          or (conversation.conversation_type = 'staff_direct'
            and (private.has_permission('chat.manage', conversation.workspace_id)
              or private.has_permission('chat.internal.read', conversation.workspace_id))
            and private.chat_is_conversation_participant(conversation.id, (select auth.uid())))
          or (conversation.deleted_at is null
            and conversation.customer_id is not null
            and private.customer_portal_has_access(conversation.customer_id)
            and (conversation.support_ticket_id is null
              or private.has_permission('customer.support.read', conversation.workspace_id)))
        )
    )
  );
