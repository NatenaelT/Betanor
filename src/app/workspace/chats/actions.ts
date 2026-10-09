"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

function field(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

async function chatContext(conversationId: string) {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.workspaceId || !access.isActive || !access.hasStaffRole || !(access.permissions.has("chat.manage") || access.permissions.has("chat.internal.read"))) {
    redirect("/workspace/chats?error=access");
  }
  const { data: conversation } = await supabase.from("chat_conversations")
    .select("id,workspace_id")
    .eq("id", conversationId)
    .eq("workspace_id", access.workspaceId)
    .maybeSingle();
  if (!conversation) redirect("/workspace/chats?error=conversation");
  return { supabase, access };
}

async function postWorkActivity(supabase: Awaited<ReturnType<typeof createClient>>, access: Awaited<ReturnType<typeof resolveWorkspace>>, conversationId: string, body: string, refs: { task_id?: string; project_id?: string }) {
  const { error } = await supabase.from("chat_messages").insert({
    conversation_id: conversationId,
    sender_profile_id: access.userId,
    sender_kind: "agent",
    body,
    is_internal: true,
    ...refs,
  });
  if (error) redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&error=share`);
}

export async function createChatTask(data: FormData) {
  const conversationId = field(data, "conversationId");
  const title = field(data, "title");
  const description = field(data, "description");
  const projectId = field(data, "projectId") || null;
  let employeeId = field(data, "employeeId") || null;
  const assigneeMention = field(data, "assigneeMention");
  const startsOn = field(data, "startsOn") || null;
  const dueOn = field(data, "dueOn") || null;
  const priority = field(data, "priority") || "medium";
  if (!conversationId || title.length < 2 || title.length > 180 || (startsOn && dueOn && dueOn < startsOn)) {
    redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&error=validation`);
  }
  const { supabase, access } = await chatContext(conversationId);
  if (!access.permissions.has("task.create") || ((employeeId || assigneeMention) && !access.permissions.has("task.assign"))) {
    redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&error=access`);
  }
  if (assigneeMention) {
    const mention = assigneeMention.replace(/^@/, "").trim();
    const separatorIndex = mention.lastIndexOf(" · ");
    const requestedNumber = separatorIndex >= 0 ? mention.slice(separatorIndex + 3).trim() : "";
    const requestedName = (separatorIndex >= 0 ? mention.slice(0, separatorIndex) : mention).trim().toLocaleLowerCase();
    const { data: employees } = await supabase.from("employees")
      .select("id,first_name,last_name,employee_number")
      .eq("workspace_id", access.workspaceId)
      .eq("employment_status", "active")
      .not("profile_id", "is", null)
      .limit(500);
    const matches = (employees ?? []).filter((employee) => requestedNumber
      ? (employee.employee_number?.toLocaleLowerCase() === requestedNumber.toLocaleLowerCase()
        || (!employee.employee_number && employee.id.toLocaleLowerCase().startsWith(requestedNumber.toLocaleLowerCase())))
      : `${employee.first_name} ${employee.last_name}`.trim().toLocaleLowerCase() === requestedName);
    if (matches.length !== 1) redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&error=assignee`);
    employeeId = matches[0].id;
  }
  const { data: taskId, error } = await supabase.rpc("create_task_with_assignee", {
    workspace_id_input: access.workspaceId,
    project_id_input: projectId,
    milestone_id_input: null,
    title_input: title,
    description_input: description || null,
    status_input: "not_started",
    priority_input: priority,
    starts_on_input: startsOn,
    due_on_input: dueOn,
    employee_id_input: employeeId,
  });
  if (error || typeof taskId !== "string") redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&error=task`);
  await postWorkActivity(supabase, access, conversationId, `Task created from chat: ${title}`, { task_id: taskId });
  revalidatePath("/workspace/tasks");
  revalidatePath(`/workspace/tasks/${taskId}`);
  revalidatePath("/workspace/chats");
  redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&created=task`);
}

export async function createChatProject(data: FormData) {
  const conversationId = field(data, "conversationId");
  const name = field(data, "name");
  const description = field(data, "description");
  if (!conversationId || name.length < 2 || name.length > 180) {
    redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&error=validation`);
  }
  const { supabase, access } = await chatContext(conversationId);
  if (!access.permissions.has("project.manage")) redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&error=access`);
  const projectCode = `BTNR-PRJ-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
  const { data: project, error } = await supabase.from("projects").insert({
    workspace_id: access.workspaceId,
    project_code: projectCode,
    name,
    description: description || null,
    currency_code: "ETB",
  }).select("id").single();
  if (error || !project) redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&error=project`);
  await postWorkActivity(supabase, access, conversationId, `Project created from chat: ${name}`, { project_id: project.id });
  revalidatePath("/workspace/projects");
  revalidatePath("/workspace/chats");
  redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&created=project`);
}

export async function shareChatTask(data: FormData) {
  const conversationId = field(data, "conversationId");
  const taskId = field(data, "taskId");
  const { supabase, access } = await chatContext(conversationId);
  if (!["task.create", "task.edit", "task.assign", "project.manage"].some((permission) => access.permissions.has(permission))) redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&error=access`);
  const { data: task } = await supabase.from("tasks").select("id,title,task_code").eq("id", taskId).eq("workspace_id", access.workspaceId).maybeSingle();
  if (!task) redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&error=share`);
  await postWorkActivity(supabase, access, conversationId, `Shared task: ${task.task_code || task.title}`, { task_id: task.id });
  revalidatePath("/workspace/chats");
  redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&shared=task`);
}

export async function shareChatProject(data: FormData) {
  const conversationId = field(data, "conversationId");
  const projectId = field(data, "projectId");
  const { supabase, access } = await chatContext(conversationId);
  const { data: project } = await supabase.from("projects").select("id,name,project_code").eq("id", projectId).eq("workspace_id", access.workspaceId).maybeSingle();
  if (!project) redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&error=share`);
  await postWorkActivity(supabase, access, conversationId, `Shared project: ${project.project_code} · ${project.name}`, { project_id: project.id });
  revalidatePath("/workspace/chats");
  redirect(`/workspace/chats?conversation=${encodeURIComponent(conversationId)}&shared=project`);
}

export async function startDirectStaffChat(recipientProfileId: string): Promise<{ conversationId?: string; error?: string }> {
  const recipientId = String(recipientProfileId ?? "").trim();
  if (!recipientId) return { error: "Choose a staff member first." };
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.workspaceId || !access.isActive || !access.hasStaffRole || !(access.permissions.has("chat.manage") || access.permissions.has("chat.internal.read"))) {
    return { error: "You do not have permission to start an internal chat." };
  }
  const { data, error } = await supabase.rpc("start_internal_direct_chat", { recipient_profile_input: recipientId });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result || typeof result.conversation_id !== "string") {
    return { error: "The staff conversation could not be started. Check the recipient and try again." };
  }
  revalidatePath("/workspace/chats");
  return { conversationId: result.conversation_id };
}

export async function startInternalGroupChat(data: FormData): Promise<never> {
  const topic = field(data, "topic").slice(0, 180);
  const body = field(data, "body").slice(0, 10000);
  const rawRecipients = data.getAll("recipientIds").map((value) => String(value).trim());
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (rawRecipients.length < 1 || rawRecipients.length > 50 || rawRecipients.some((id) => !uuidPattern.test(id))) {
    redirect("/workspace/chats?view=internal&error=recipients");
  }
  const recipientIds = [...new Set(rawRecipients)];
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.workspaceId || !access.isActive || !access.hasStaffRole || !(access.permissions.has("chat.manage") || access.permissions.has("chat.internal.read"))) {
    redirect("/workspace/chats?view=internal&error=access");
  }
  const { data: rows, error } = await supabase.rpc("start_internal_group_chat", {
    topic_input: topic || null,
    message_input: body,
    recipient_profile_ids_input: recipientIds,
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  if (error || !created?.conversation_id) redirect("/workspace/chats?view=internal&error=create");
  revalidatePath("/workspace/chats");
  redirect(`/workspace/chats?view=internal&conversation=${encodeURIComponent(created.conversation_id)}`);
}

export async function setChatConversationState(conversationId: string, action: "archive" | "delete" | "restore"): Promise<{ error?: string }> {
  const id = String(conversationId ?? "").trim();
  if (!id) return { error: "Conversation not found." };
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.workspaceId || !access.isActive || !access.hasStaffRole) {
    return { error: "Sign in with an active staff account to manage conversations." };
  }
  const { error } = await supabase.rpc("chat_set_conversation_state", { conversation_id_input: id, action_input: action });
  if (error) return { error: error.message.includes("Ticket conversations") ? "Ticket-linked conversations are retained with their support record; archive them instead." : "This conversation could not be updated. Check your access and try again." };
  revalidatePath("/workspace/chats");
  return {};
}
