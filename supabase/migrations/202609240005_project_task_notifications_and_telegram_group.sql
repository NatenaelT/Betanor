-- Project administration, task assignment alerts, and a private Telegram group mirror.
-- Telegram remains a transport; existing projects, tasks, notifications, and chat stay canonical.

-- Admins/project managers can delete projects. Preserve task history when the project is removed;
-- financial records, letters, and support records already detach their project FK on delete.
grant delete on public.projects to authenticated;
drop policy if exists "project staff delete" on public.projects;
create policy "project staff delete" on public.projects
  for delete to authenticated
  using ((select private.has_permission('project.manage', workspace_id)));

alter table public.tasks
  drop constraint if exists tasks_project_id_fkey;
alter table public.tasks
  add constraint tasks_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;

-- Stable short task references let staff associate Telegram replies with a task without sharing UUIDs.
alter table public.tasks
  add column if not exists task_number bigint generated always as identity;
alter table public.tasks
  add column if not exists task_code text generated always as
    ('BTNR-TASK-' || lpad(task_number::text, greatest(8, length(task_number::text)), '0')) stored;
create unique index if not exists tasks_task_code_uidx on public.tasks(task_code);

-- A single allowlisted Telegram group is mirrored into the existing internal chat system.
create table if not exists public.telegram_group_bindings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  telegram_chat_id text not null unique check (telegram_chat_id ~ '^-?[0-9]{1,32}$'),
  telegram_username text,
  title text not null,
  conversation_id uuid not null unique references public.chat_conversations(id) on delete cascade,
  is_active boolean not null default true,
  linked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_messages
  add column if not exists task_id uuid references public.tasks(id) on delete set null,
  add column if not exists telegram_group_chat_id text,
  add column if not exists telegram_group_message_id bigint,
  add column if not exists telegram_sender_label text;

alter table public.chat_messages
  drop constraint if exists chat_messages_sender_kind_check;
alter table public.chat_messages
  add constraint chat_messages_sender_kind_check
  check (sender_kind = any (array['guest'::text, 'customer'::text, 'agent'::text, 'system'::text, 'telegram_group'::text]));

create unique index if not exists chat_messages_telegram_group_message_uidx
  on public.chat_messages(telegram_group_chat_id, telegram_group_message_id)
  where telegram_group_chat_id is not null and telegram_group_message_id is not null;
create index if not exists chat_messages_task_discussion_idx
  on public.chat_messages(task_id, created_at desc)
  where task_id is not null;
create index if not exists telegram_group_bindings_workspace_idx
  on public.telegram_group_bindings(workspace_id, is_active);

create or replace function private.is_active_staff_profile(profile_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = profile_id_input
      and profile.account_type = 'staff'
      and profile.is_active
  );
$$;
revoke all on function private.is_active_staff_profile(uuid) from public, anon;
grant execute on function private.is_active_staff_profile(uuid) to authenticated, service_role;

create or replace function private.task_is_assigned_to_profile(task_id_input uuid, profile_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.task_assignees assignment
    join public.employees employee on employee.id = assignment.employee_id
    join public.profiles profile on profile.id = employee.profile_id
    where assignment.task_id = task_id_input
      and profile.id = profile_id_input
      and profile.account_type = 'staff'
      and profile.is_active
      and employee.employment_status = 'active'
  );
$$;
revoke all on function private.task_is_assigned_to_profile(uuid, uuid) from public, anon;
grant execute on function private.task_is_assigned_to_profile(uuid, uuid) to authenticated, service_role;

alter table public.telegram_group_bindings enable row level security;
revoke all on public.telegram_group_bindings from anon, authenticated;
grant select on public.telegram_group_bindings to authenticated;
create policy telegram_group_bindings_read_authorized_staff on public.telegram_group_bindings
  for select to authenticated using (
    private.is_active_staff_profile((select auth.uid()))
    and (
      (select private.has_permission('settings.manage', workspace_id))
      or (select private.has_permission('chat.internal.read', workspace_id))
    )
  );

insert into public.permissions(code, module, description)
values
  ('chat.internal.read', 'communication', 'Read the mirrored internal Telegram team conversation')
on conflict (code) do update
  set module = excluded.module, description = excluded.description;

-- Existing built-in staff roles can read the employee team conversation. Custom roles remain
-- permission-managed by administrators, and customer roles never receive this capability.
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'chat.internal.read'
where role.workspace_id is null and role.role_type = 'staff'
on conflict do nothing;

-- Assigned employees must be able to see their own task, assignment, notes, and task-linked group chat.
drop policy if exists "assigned staff read assigned tasks" on public.tasks;
create policy "assigned staff read assigned tasks" on public.tasks
  for select to authenticated
  using ((select private.task_is_assigned_to_profile(id, (select auth.uid()))));

drop policy if exists "task assignee self read" on public.task_assignees;
create policy "task assignee self read" on public.task_assignees
  for select to authenticated
  using ((select private.task_is_assigned_to_profile(task_id, (select auth.uid()))));

drop policy if exists "assigned staff read task comments" on public.task_comments;
create policy "assigned staff read task comments" on public.task_comments
  for select to authenticated
  using ((select private.task_is_assigned_to_profile(task_id, (select auth.uid()))));

drop policy if exists "assigned staff add task comments" on public.task_comments;
create policy "assigned staff add task comments" on public.task_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select private.task_is_assigned_to_profile(task_id, (select auth.uid())))
  );

create or replace function public.create_task_with_assignee(
  workspace_id_input uuid,
  project_id_input uuid,
  milestone_id_input uuid,
  title_input text,
  description_input text,
  status_input text,
  priority_input text,
  starts_on_input date,
  due_on_input date,
  employee_id_input uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  task_id_value uuid;
begin
  if actor_id is null or coalesce(length(trim(title_input)), 0) < 2 or length(title_input) > 180 then
    raise exception 'A valid task title and signed-in staff account are required.' using errcode = '22023';
  end if;
  if status_input not in ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled') then
    raise exception 'Choose a valid task status.' using errcode = '22023';
  end if;
  if priority_input not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Choose a valid task priority.' using errcode = '22023';
  end if;
  if due_on_input is not null and starts_on_input is not null and due_on_input < starts_on_input then
    raise exception 'The task due date cannot precede its start date.' using errcode = '22023';
  end if;
  if not private.is_active_staff_profile(actor_id)
     or not private.has_permission('task.create', workspace_id_input) then
    raise exception 'You do not have permission to create tasks in this workspace.' using errcode = '42501';
  end if;
  if project_id_input is not null and not exists (
    select 1 from public.projects project
    where project.id = project_id_input and project.workspace_id = workspace_id_input
  ) then
    raise exception 'Choose a project in this workspace.' using errcode = '22023';
  end if;
  if milestone_id_input is not null and not exists (
    select 1 from public.milestones milestone
    join public.projects project on project.id = milestone.project_id
    where milestone.id = milestone_id_input
      and project.workspace_id = workspace_id_input
      and (project_id_input is null or milestone.project_id = project_id_input)
  ) then
    raise exception 'Choose a milestone from the selected project.' using errcode = '22023';
  end if;

  if employee_id_input is not null then
    if not private.has_permission('task.assign', workspace_id_input) then
      raise exception 'You do not have permission to assign tasks.' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.employees employee
      join public.profiles profile on profile.id = employee.profile_id
      where employee.id = employee_id_input
        and employee.workspace_id = workspace_id_input
        and employee.employment_status = 'active'
        and profile.account_type = 'staff'
        and profile.is_active
    ) then
      raise exception 'Choose an active employee with a portal account.' using errcode = '22023';
    end if;
  end if;

  insert into public.tasks(
    workspace_id, project_id, milestone_id, title, description, status, priority,
    starts_on, due_on, created_by
  ) values (
    workspace_id_input, project_id_input, milestone_id_input, trim(title_input),
    nullif(trim(coalesce(description_input, '')), ''),
    status_input::public.task_status,
    priority_input::public.priority_level,
    starts_on_input, due_on_input, actor_id
  ) returning id into task_id_value;

  if employee_id_input is not null then
    insert into public.task_assignees(task_id, employee_id)
    values (task_id_value, employee_id_input);
  end if;

  return task_id_value;
end;
$$;
revoke all on function public.create_task_with_assignee(uuid, uuid, uuid, text, text, text, text, date, date, uuid) from public, anon;
grant execute on function public.create_task_with_assignee(uuid, uuid, uuid, text, text, text, text, date, date, uuid) to authenticated;

create or replace function public.update_assigned_task_status(task_id_input uuid, status_input text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  task_workspace_id uuid;
begin
  if actor_id is null or status_input not in ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled') then
    raise exception 'Choose a valid task status.' using errcode = '22023';
  end if;
  select task.workspace_id into task_workspace_id from public.tasks task where task.id = task_id_input;
  if task_workspace_id is null or not private.is_active_staff_profile(actor_id) then
    raise exception 'The requested task is not available.' using errcode = '42501';
  end if;
  if not private.task_is_assigned_to_profile(task_id_input, actor_id)
     and not private.has_permission('task.edit', task_workspace_id)
     and not private.has_permission('project.manage', task_workspace_id) then
    raise exception 'You can only update the status of a task assigned to you.' using errcode = '42501';
  end if;

  update public.tasks
  set status = status_input::public.task_status,
      completed_at = case when status_input = 'completed' then coalesce(completed_at, now()) else null end,
      updated_at = now()
  where id = task_id_input;
end;
$$;
revoke all on function public.update_assigned_task_status(uuid, text) from public, anon;
grant execute on function public.update_assigned_task_status(uuid, text) to authenticated;

drop policy if exists "staff read configured telegram group conversation" on public.chat_conversations;
create policy "staff read configured telegram group conversation" on public.chat_conversations
  for select to authenticated
  using (
    exists (
      select 1 from public.telegram_group_bindings binding
      where binding.conversation_id = chat_conversations.id
        and binding.workspace_id = chat_conversations.workspace_id
        and binding.is_active
    )
    and (select private.has_permission('chat.internal.read', workspace_id))
    and (select private.is_active_staff_profile((select auth.uid())))
  );

drop policy if exists "staff read mirrored telegram group messages" on public.chat_messages;
create policy "staff read mirrored telegram group messages" on public.chat_messages
  for select to authenticated
  using (
    sender_kind = 'telegram_group'
    and is_internal
    and exists (
      select 1 from public.chat_conversations conversation
      join public.telegram_group_bindings binding on binding.conversation_id = conversation.id
      where conversation.id = chat_messages.conversation_id
        and conversation.workspace_id = binding.workspace_id
        and binding.is_active
        and (select private.has_permission('chat.internal.read', conversation.workspace_id))
    )
    and (select private.is_active_staff_profile((select auth.uid())))
  );

drop policy if exists "staff read assigned telegram task discussions" on public.chat_messages;
create policy "staff read assigned telegram task discussions" on public.chat_messages
  for select to authenticated
  using (
    sender_kind = 'telegram_group'
    and is_internal
    and task_id is not null
    and (select private.task_is_assigned_to_profile(task_id, (select auth.uid())))
  );

-- Let an authorized staff member open a mirrored private attachment only when they can read
-- its group message, either through internal-chat permission or task assignment.
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
          (select private.has_permission('chat.manage', conversation.workspace_id))
          or (conversation.customer_id is not null and (select private.customer_portal_has_access(conversation.customer_id)))
          or (
            message.sender_kind = 'telegram_group'
            and (select private.has_permission('chat.internal.read', conversation.workspace_id))
            and (select private.is_active_staff_profile((select auth.uid())))
          )
          or (message.sender_kind = 'telegram_group' and message.task_id is not null and (select private.task_is_assigned_to_profile(message.task_id, (select auth.uid()))))
        )
    )
  );

-- Assignment inserts create a normal in-app notification; the existing notification trigger
-- independently queues an opted-in, individually linked Telegram DM.
create or replace function private.notify_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_record public.tasks%rowtype;
  employee_record public.employees%rowtype;
  profile_record public.profiles%rowtype;
  telegram_enabled boolean := false;
begin
  select * into task_record from public.tasks task where task.id = new.task_id;
  select * into employee_record from public.employees employee where employee.id = new.employee_id;
  if task_record.id is null or employee_record.profile_id is null then return new; end if;

  select * into profile_record
  from public.profiles profile
  where profile.id = employee_record.profile_id
    and profile.is_active
    and profile.account_type = 'staff';
  if profile_record.id is null then return new; end if;

  select coalesce(preference.telegram, false) and exists (
    select 1 from public.telegram_connections connection
    where connection.profile_id = profile_record.id
  ) into telegram_enabled
  from public.support_notification_preferences preference
  where preference.profile_id = profile_record.id;
  telegram_enabled := coalesce(telegram_enabled, false);

  if coalesce((
    select preference.in_app
    from public.support_notification_preferences preference
    where preference.profile_id = profile_record.id
  ), true) or telegram_enabled then
    insert into public.notifications(recipient_id, type, title, body, entity_type, entity_id)
    values (
      profile_record.id,
      'TASK_ASSIGNED',
      'New task assigned',
      format('You have been assigned: %s', task_record.title),
      'task',
      task_record.id
    );
  end if;

  return new;
end;
$$;
revoke all on function private.notify_task_assignee() from public, anon, authenticated;
drop trigger if exists task_assignee_notification on public.task_assignees;
create trigger task_assignee_notification
  after insert on public.task_assignees
  for each row execute function private.notify_task_assignee();

-- Called only by the authenticated Telegram Edge Function using service_role.
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
  if workspace_id_value is null or not private.has_permission('settings.manage', workspace_id_value) then
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

create or replace function public.telegram_record_group_message(
  telegram_chat_id_input text,
  telegram_message_id_input bigint,
  telegram_user_id_input text,
  sender_label_input text,
  body_input text,
  task_code_input text default null,
  reply_to_message_id_input bigint default null,
  attachment_path_input text default null,
  attachment_name_input text default null,
  attachment_mime_type_input text default null,
  attachment_size_bytes_input bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  binding public.telegram_group_bindings%rowtype;
  existing_message_id uuid;
  task_id_value uuid;
  sender_profile_id_value uuid;
  message_id_value uuid;
  body_value text := left(trim(coalesce(body_input, '')), 4000);
begin
  if telegram_chat_id_input !~ '^-?[0-9]{1,32}$'
     or telegram_message_id_input is null
     or telegram_user_id_input !~ '^[0-9]{1,32}$'
     or coalesce(length(trim(sender_label_input)), 0) < 1
     or coalesce(length(body_value), 0) < 1 then
    raise exception 'Invalid Telegram group message.' using errcode = '22023';
  end if;

  select * into binding
  from public.telegram_group_bindings configured
  where configured.telegram_chat_id = telegram_chat_id_input
    and configured.is_active;
  if binding.id is null then
    raise exception 'This Telegram group is not connected to Betanor.' using errcode = '42501';
  end if;

  select message.id into existing_message_id
  from public.chat_messages message
  where message.telegram_group_chat_id = telegram_chat_id_input
    and message.telegram_group_message_id = telegram_message_id_input;
  if existing_message_id is not null then return existing_message_id; end if;

  if nullif(trim(task_code_input), '') is not null then
    select task.id into task_id_value
    from public.tasks task
    where task.task_code = upper(trim(task_code_input))
      and task.workspace_id = binding.workspace_id;
  end if;

  if task_id_value is null and reply_to_message_id_input is not null then
    select prior.task_id into task_id_value
    from public.chat_messages prior
    where prior.telegram_group_chat_id = telegram_chat_id_input
      and prior.telegram_group_message_id = reply_to_message_id_input
      and prior.task_id is not null;
  end if;

  select connection.profile_id into sender_profile_id_value
  from public.telegram_connections connection
  join public.profiles profile on profile.id = connection.profile_id
  where connection.telegram_user_id = telegram_user_id_input
    and profile.workspace_id = binding.workspace_id
    and profile.account_type = 'staff'
    and profile.is_active
  limit 1;

  insert into public.chat_messages(
    conversation_id, sender_profile_id, sender_kind, body, is_internal, task_id,
    telegram_group_chat_id, telegram_group_message_id, telegram_sender_label,
    attachment_path, attachment_name, attachment_mime_type, attachment_size_bytes
  ) values (
    binding.conversation_id, sender_profile_id_value, 'telegram_group', body_value, true, task_id_value,
    telegram_chat_id_input, telegram_message_id_input, left(trim(sender_label_input), 160),
    attachment_path_input, attachment_name_input, attachment_mime_type_input, attachment_size_bytes_input
  )
  on conflict (telegram_group_chat_id, telegram_group_message_id)
    where telegram_group_chat_id is not null and telegram_group_message_id is not null
  do nothing
  returning id into message_id_value;

  if message_id_value is null then
    select message.id into message_id_value
    from public.chat_messages message
    where message.telegram_group_chat_id = telegram_chat_id_input
      and message.telegram_group_message_id = telegram_message_id_input;
  end if;

  update public.chat_conversations
  set updated_at = now()
  where id = binding.conversation_id;

  return message_id_value;
end;
$$;
revoke all on function public.telegram_record_group_message(text, bigint, text, text, text, text, bigint, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.telegram_record_group_message(text, bigint, text, text, text, text, bigint, text, text, text, bigint) to service_role;
