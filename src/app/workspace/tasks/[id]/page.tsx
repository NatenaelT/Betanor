import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function tone(status: string) { return status === "completed" ? "success" as const : status === "blocked" || status === "cancelled" ? "danger" as const : status === "in_progress" ? "info" as const : "draft" as const; }

async function updateTask(data: FormData) {
  "use server";
  const taskId = String(data.get("taskId") ?? "");
  if (!taskId) return;
  const status = String(data.get("status") ?? "not_started");
  const supabase = await createClient();
  await supabase.from("tasks").update({ title: String(data.get("title") ?? "").trim(), description: String(data.get("description") ?? "").trim() || null, status, priority: String(data.get("priority") ?? "medium"), starts_on: String(data.get("startsOn") ?? "") || null, due_on: String(data.get("dueOn") ?? "") || null, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", taskId);
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
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return;
  await supabase.from("task_comments").insert({ task_id: taskId, author_id: claims.claims.sub, body });
  revalidatePath(`/workspace/tasks/${taskId}`);
}

async function addAssignee(data: FormData) {
  "use server";
  const taskId = String(data.get("taskId") ?? "");
  const employeeId = String(data.get("employeeId") ?? "");
  if (!taskId || !employeeId) return;
  const supabase = await createClient();
  await supabase.from("task_assignees").upsert({ task_id: taskId, employee_id: employeeId });
  revalidatePath(`/workspace/tasks/${taskId}`);
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: task, error }, { data: employees }] = await Promise.all([
    supabase.from("tasks").select("id,title,description,status,priority,starts_on,due_on,created_at,projects(id,name,project_code),milestones(id,title),task_assignees(employee_id,employees(first_name,last_name,employee_number)),task_comments(id,body,author_id,created_at)").eq("id", id).maybeSingle(),
    supabase.from("employees").select("id,first_name,last_name,employee_number").eq("employment_status", "active").order("first_name"),
  ]);
  if (error || !task) notFound();
  const project = task.projects?.[0];
  const milestone = task.milestones?.[0];
  const assignments = task.task_assignees ?? [];
  const comments = [...(task.task_comments ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  return <main className="mx-auto max-w-6xl px-6 py-10 lg:px-8"><Link href="/workspace/tasks" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">← Back to work queue</Link><div className="mt-5 flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={tone(task.status)}>{titleCase(task.status)}</Badge><Badge tone={task.priority === "urgent" ? "danger" : task.priority === "high" ? "warning" : "neutral"}>{titleCase(task.priority)} priority</Badge></div><h1 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">{task.title}</h1><p className="mt-2 text-sm text-[var(--betanor-muted)]">{project ? `${project.project_code} · ${project.name}` : "Internal work"}{milestone ? ` · ${milestone.title}` : ""}</p></div><div className="text-sm text-[var(--betanor-muted)]">Created {new Date(task.created_at).toLocaleDateString("en-GB")}</div></div><div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><Card className="p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Task brief and delivery controls</h2><form action={updateTask} className="mt-5 grid gap-4 md:grid-cols-2"><input type="hidden" name="taskId" value={task.id}/><div className="md:col-span-2"><FieldLabel htmlFor="edit-title">Task title</FieldLabel><Input id="edit-title" name="title" defaultValue={task.title} required/></div><div><FieldLabel htmlFor="edit-status">Status</FieldLabel><select id="edit-status" name="status" defaultValue={task.status} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div><div><FieldLabel htmlFor="edit-priority">Priority</FieldLabel><select id="edit-priority" name="priority" defaultValue={task.priority} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div><div><FieldLabel htmlFor="edit-start">Starts on</FieldLabel><Input id="edit-start" name="startsOn" type="date" defaultValue={task.starts_on ?? ""}/></div><div><FieldLabel htmlFor="edit-due">Due on</FieldLabel><Input id="edit-due" name="dueOn" type="date" defaultValue={task.due_on ?? ""}/></div><div className="md:col-span-2"><FieldLabel htmlFor="edit-description">Scope / acceptance notes</FieldLabel><textarea id="edit-description" name="description" rows={5} defaultValue={task.description ?? ""} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm"/></div><div className="md:col-span-2"><Button type="submit">Save delivery update</Button></div></form></Card><div className="space-y-6"><Card className="p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Delivery owners</h2><div className="mt-4 space-y-2">{assignments.length ? assignments.map((assignment) => <div key={assignment.employee_id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">{assignment.employees?.[0] ? `${assignment.employees[0].first_name} ${assignment.employees[0].last_name} · ${assignment.employees[0].employee_number}` : "Assigned staff member"}</div>) : <p className="text-sm text-[var(--betanor-muted)]">No owner assigned.</p>}</div><form action={addAssignee} className="mt-4 flex gap-2"><input type="hidden" name="taskId" value={task.id}/><select name="employeeId" required className="min-h-9 min-w-0 flex-1 rounded-lg border border-[var(--betanor-border)] bg-white px-2 text-xs"><option value="">Add owner</option>{employees?.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select><Button type="submit" size="sm" variant="outline">Assign</Button></form></Card><Card className="p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Delivery updates</h2><div className="mt-4 space-y-3">{comments.length ? comments.map((comment) => <div key={comment.id} className="rounded-lg border border-[var(--betanor-border)] p-3"><p className="text-sm text-[var(--betanor-text)]">{comment.body}</p><p className="mt-2 text-xs text-[var(--betanor-muted)]">{new Date(comment.created_at).toLocaleString("en-GB")}</p></div>) : <p className="text-sm text-[var(--betanor-muted)]">No updates yet. Record the next decision or blocker.</p>}</div><form action={addComment} className="mt-4"><input type="hidden" name="taskId" value={task.id}/><textarea required name="body" rows={3} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="Record a delivery update, blocker, or acceptance note"/><Button type="submit" size="sm" className="mt-2">Add update</Button></form></Card></div></div></main>;
}
