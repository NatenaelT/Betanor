export type NorenNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

const taskTypes = new Set(["TASK_ASSIGNED", "TASK_DUE", "TASK_OVERDUE"]);

export function isAssignmentNotification(item: Pick<NorenNotification, "type" | "entity_type">) {
  return item.entity_type === "task" || taskTypes.has(item.type.toUpperCase());
}

export function notificationHref(
  item: Pick<NorenNotification, "entity_type" | "entity_id">,
  permissions: ReadonlySet<string>,
) {
  const id = item.entity_id;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return "/workspace/noren/inbox";
  switch (item.entity_type) {
    case "task": return `/workspace/tasks/${id}`;
    case "chat_conversation": return permissions.has("chat.manage") || permissions.has("chat.internal.read") ? "/workspace/chats" : "/workspace/noren/inbox";
    case "support_ticket": return permissions.has("support.read") || permissions.has("support.view_all") ? `/workspace/support/tickets/${id}` : "/workspace/noren/inbox";
    case "letter": return permissions.has("letters.read") || permissions.has("letters.view_department") || permissions.has("letters.view_all") ? `/workspace/letters/${id}` : "/workspace/noren/inbox";
    case "tender": return permissions.has("tender.read") || permissions.has("tender.view_all") ? `/workspace/tenders/${id}` : "/workspace/noren/inbox";
    case "project": return permissions.has("project.manage") ? `/workspace/projects/${id}` : "/workspace/noren/inbox";
    default: return "/workspace/noren/inbox";
  }
}
