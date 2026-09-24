import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { ChatRealtimeBridge } from "@/components/chat/chat-realtime-bridge";
import { createClient } from "@/lib/supabase/server";
import { relationArray } from "@/lib/supabase/relations";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function tone(status: string) { return status === "completed" ? "success" as const : status === "blocked" || status === "cancelled" ? "danger" as const : status === "in_progress" ? "info" as const : "draft" as const; }

async function updateTask(data: FormData) {
  "use server";
  const taskId = String(data.get("taskId") ?? "");
  if (!taskId) return;
  const status = String(data.get("status") ?? "not_started");
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.hasStaffRole || !["task.edit", "task.create", "project.manage"].some((permission) => access.permissions.has(permission))) redirect(`/workspace/tasks/${taskId}?error=edit`);
  const { error } = await supabase.from("tasks").update({ title: String(data.get("title") ?? "").trim(), description: String(data.get("description") ?? "").trim() || null, status, priority: String(data.get("priority") ?? "medium"), starts_on: String(data.get("startsOn") ?? "") || null, due_on: String(data.get("dueOn") ?? "") || null, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", taskId);
  if (error) redirect(`/workspace/tasks/${taskId}?error=edit`);
  revalidatePath(`/workspace/tasks/${taskId}`);
  revalidatePath("/workspace/tasks");
  revalidatePath("/workspace/my-work");
}

async function addComment(data: FormData) {
  "use server";
  const taskId = String(data.get("taskId") ?? "");
  const body = String(data.get("body") ?? "").trim();
  if (!taskId || !body) return;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.hasStaffRole) return;
  const { error } = await supabase.from("task_comments").insert({ task_id: taskId, author_id: access.userId, body });
  if (error) redirect(`/workspace/tasks/${taskId}?error=comment`);
  revalidatePath(`/workspace/tasks/${taskId}`);
}

async function addAssignee(data: FormData) {
  "use server";
  const taskId = String(data.get("taskId") ?? "");
  const employeeId = String(data.get("employeeId") ?? "");
  if (!taskId || !employeeId) return;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.hasStaffRole || !access.permissions.has("task.assign")) redirect(`/workspace/tasks/${taskId}?error=assign`);
  const { error } = await supabase.from("task_assignees").upsert({ task_id: taskId, employee_id: employeeId });
  if (error) redirect(`/workspace/tasks/${taskId}?error=assign`);
  revalidatePath(`/workspace/tasks/${taskId}`);
}

export default async function TaskDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, routeParams] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  const [{ data: task, error }, { data: employees }, { data: telegramMessages }, { data: currentEmployee }] = await Promise.all([
    supabase.from("tasks").select("id,task_code,title,description,status,priority,starts_on,due_on,created_at,projects(id,name,project_code),milestones(id,title),task_assignees(employee_id,employees(first_name,last_name,employee_number)),task_comments(id,body,author_id,created_at)").eq("id", id).maybeSingle(),
    access.hasStaffRole && access.permissions.has("task.assign") ? supabase.from("employees").select("id,first_name,last_name,employee_number").eq("employment_status", "active").not("profile_id", "is", null).order("first_name") : Promise.resolve({ data: [] }),
    supabase.from("chat_messages").select("id,body,telegram_sender_label,attachment_name,task_id,created_at").eq("task_id", id).eq("sender_kind", "telegram_group").order("created_at", { ascending: true }).limit(100),
    access.userId ? supabase.from("employees").select("id").eq("profile_id", access.userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (error || !task) notFound();
  const project = relationArray(task.projects)[0];
  const milestone = relationArray(task.milestones)[0];
  const assignments = (task.task_assignees ?? []).map((assignment) => ({ ...assignment, employees: relationArray(assignment.employees) }));
  const comments = [...(task.task_comments ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const groupMessages = telegramMessages ?? [];
  const canEditTask = access.hasStaffRole && ["task.edit", "task.create", "project.manage"].some((permission) => access.permissions.has(permission));
  const canAssignTask = access.hasStaffRole && access.permissions.has("task.assign");
  const canAddUpdates = access.hasStaffRole && (canEditTask || assignments.some((assignment) => assignment.employee_id === currentEmployee?.id));

  return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
    {access.workspaceId ? <ChatRealtimeBridge workspaceId={access.workspaceId} /> : null}
    <Link href="/workspace/tasks" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">← Back to work queue</Link>
    <div className="mt-5 flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={tone(task.status)}>{titleCase(task.status)}</Badge><Badge tone={task.priority === "urgent" ? "danger" : task.priority === "high" ? "warning" : "neutral"}>{titleCase(task.priority)} priority</Badge></div><h1 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">{task.title}</h1><p className="mt-2 text-sm text-[var(--betanor-muted)]">{task.task_code} · {project ? `${project.project_code} · ${project.name}` : "Internal work"}{milestone ? ` · ${milestone.title}` : ""}</p></div><div className="text-sm text-[var(--betanor-muted)]">Created {new Date(task.created_at).toLocaleDateString("en-GB")}</div></div>
    {routeParams.error ? <Card role="alert" className="mt-6 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{routeParams.error === "assign" ? "The assignee could not be added. Confirm task.assign access and that the employee has an active portal account." : routeParams.error === "comment" ? "The update could not be saved. Only an authorized staff member assigned to this task may add an update." : "The task could not be updated. Check your task permissions and the start/due dates."}</Card> : null}
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <Card className="p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Task brief and delivery controls</h2><p className="mt-2 text-sm leading-6 text-[var(--betanor-text)]">{task.description || "No scope notes have been recorded."}</p><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-[var(--betanor-muted)]">Start date</dt><dd className="mt-1 font-semibold text-[var(--betanor-navy)]">{task.starts_on || "Not scheduled"}</dd></div><div><dt className="text-xs text-[var(--betanor-muted)]">Due date</dt><dd className="mt-1 font-semibold text-[var(--betanor-navy)]">{task.due_on || "Not scheduled"}</dd></div></dl>
        {canEditTask ? <form action={updateTask} className="mt-6 grid gap-4 border-t border-[var(--betanor-border)] pt-5 md:grid-cols-2"><input type="hidden" name="taskId" value={task.id}/><div className="md:col-span-2"><FieldLabel required htmlFor="edit-title">Task title</FieldLabel><Input id="edit-title" name="title" defaultValue={task.title} required maxLength={180}/></div><div><FieldLabel htmlFor="edit-status">Status</FieldLabel><select id="edit-status" name="status" defaultValue={task.status} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div><div><FieldLabel htmlFor="edit-priority">Priority</FieldLabel><select id="edit-priority" name="priority" defaultValue={task.priority} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div><div><FieldLabel htmlFor="edit-start">Starts on</FieldLabel><Input id="edit-start" name="startsOn" type="date" defaultValue={task.starts_on ?? ""}/></div><div><FieldLabel htmlFor="edit-due">Due on</FieldLabel><Input id="edit-due" name="dueOn" type="date" defaultValue={task.due_on ?? ""}/></div><div className="md:col-span-2"><FieldLabel htmlFor="edit-description">Scope / acceptance notes</FieldLabel><textarea id="edit-description" name="description" rows={4} maxLength={4000} defaultValue={task.description ?? ""} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm"/></div><div className="md:col-span-2"><Button type="submit">Save task changes</Button></div></form> : null}
      </Card>

      <div className="space-y-6">
        <Card className="p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Delivery owners</h2><div className="mt-4 space-y-2">{assignments.length ? assignments.map((assignment) => <div key={assignment.employee_id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">{assignment.employees?.[0] ? `${assignment.employees[0].first_name} ${assignment.employees[0].last_name} · ${assignment.employees[0].employee_number}` : "Assigned staff member"}</div>) : <p className="text-sm text-[var(--betanor-muted)]">No owner assigned.</p>}</div>{canAssignTask ? <form action={addAssignee} className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="hidden" name="taskId" value={task.id}/><select name="employeeId" required className="min-h-9 min-w-0 flex-1 rounded-lg border border-[var(--betanor-border)] bg-white px-2 text-xs"><option value="">Assign to staff with portal access</option>{employees?.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name} · {employee.employee_number}</option>)}</select><Button type="submit" size="sm" variant="outline">Assign</Button></form> : null}<p className="mt-3 text-xs leading-5 text-[var(--betanor-muted)]">New assignments create a portal notification and a private Telegram alert when that employee has linked Telegram and enabled notifications.</p></Card>

        {groupMessages.length ? <Card className="p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Telegram task discussion</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">Messages from the employee group that reference this task.</p></div><Badge tone="info">{groupMessages.length} message{groupMessages.length === 1 ? "" : "s"}</Badge></div><div className="mt-4 max-h-[26rem] space-y-3 overflow-y-auto">{groupMessages.map((message) => <div key={message.id} className="rounded-xl border border-[var(--betanor-border)] bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[var(--betanor-navy)]">{message.telegram_sender_label || "Telegram group member"}</p><time className="text-xs text-[var(--betanor-muted)]">{new Date(message.created_at).toLocaleString("en-GB")}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--betanor-text)]">{message.body}</p>{message.attachment_name ? <a className="mt-2 block text-xs font-semibold text-[var(--betanor-blue)] hover:underline" href={`/api/chat/attachments/${message.id}`} target="_blank" rel="noreferrer">📎 {message.attachment_name}</a> : null}</div>)}</div></Card> : null}

        <Card className="p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Delivery updates</h2><div className="mt-4 space-y-3">{comments.length ? comments.map((comment) => <div key={comment.id} className="rounded-lg border border-[var(--betanor-border)] p-3"><p className="whitespace-pre-wrap text-sm text-[var(--betanor-text)]">{comment.body}</p><p className="mt-2 text-xs text-[var(--betanor-muted)]">{new Date(comment.created_at).toLocaleString("en-GB")}</p></div>) : <p className="text-sm text-[var(--betanor-muted)]">No updates yet. Record the next decision or blocker.</p>}</div>{canAddUpdates ? <form action={addComment} className="mt-4"><input type="hidden" name="taskId" value={task.id}/><textarea required name="body" rows={3} maxLength={3000} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="Record a delivery update, blocker, or acceptance note"/><Button type="submit" size="sm" className="mt-2">Add update</Button></form> : null}</Card>
      </div>
    </div>
  </main>;
}
