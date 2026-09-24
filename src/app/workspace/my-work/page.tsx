import Link from "next/link";
import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

async function updateTaskStatus(data: FormData) {
  "use server";
  const taskId = String(data.get("taskId") ?? "");
  const status = String(data.get("status") ?? "");
  if (!taskId || !status) return;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.hasStaffRole) return;
  const { error } = await supabase.rpc("update_assigned_task_status", { task_id_input: taskId, status_input: status });
  if (error) return;
  revalidatePath("/workspace/my-work");
  revalidatePath(`/workspace/tasks/${taskId}`);
}

function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function tone(status: string) { return status === "completed" ? "success" as const : status === "blocked" ? "danger" as const : status === "in_progress" ? "info" as const : "draft" as const; }

export default async function MyWorkPage() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  const userId = access.userId;
  const { data: employee } = userId ? await supabase.from("employees").select("id,first_name,last_name,employee_number,department_id").eq("profile_id", userId).maybeSingle() : { data: null };
  const query = supabase.from("tasks").select("id,task_code,title,status,priority,starts_on,due_on,description,projects(name,project_code),milestones(title),task_assignees!inner(employee_id)").order("due_on", { ascending: true, nullsFirst: false });
  const { data: tasks, error } = employee ? await query.eq("task_assignees.employee_id", employee.id) : userId ? await supabase.from("tasks").select("id,task_code,title,status,priority,starts_on,due_on,description,projects(name,project_code),milestones(title)").eq("created_by", userId).order("due_on", { ascending: true, nullsFirst: false }) : { data: [], error: null };
  const rows = tasks ?? [];

  const canManageAllTasks = access.hasStaffRole && ["task.create", "task.assign", "task.edit"].some((permission) => access.permissions.has(permission));
  return <main className="mx-auto max-w-5xl px-6 py-10 lg:px-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Work module</p><h1 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">My work</h1><p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">Your accountable delivery queue, prioritised by due date.</p></div>{canManageAllTasks ? <Link href="/workspace/tasks" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Manage all tasks →</Link> : null}</div>{employee ? <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-900">Signed in as <strong>{employee.first_name} {employee.last_name}</strong> · {employee.employee_number}</div> : <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">No employee profile is linked to this login yet. Showing tasks you created; an HR administrator can link your staff profile.</div>}{error ? <Card className="mt-6 p-6 text-sm text-[var(--betanor-danger)]">Your work could not be loaded.</Card> : rows.length === 0 ? <Card className="mt-6 p-8 text-center"><p className="font-semibold text-[var(--betanor-navy)]">Your queue is clear</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">Assigned tasks will appear here with their Ethiopian delivery dates and project context.</p></Card> : <div className="mt-6 space-y-4">{rows.map((task) => <Card key={task.id} className="p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={tone(task.status)}>{titleCase(task.status)}</Badge><Badge tone={task.priority === "urgent" ? "danger" : task.priority === "high" ? "warning" : "neutral"}>{titleCase(task.priority)}</Badge></div><Link href={`/workspace/tasks/${task.id}`} className="mt-3 block text-lg font-semibold text-[var(--betanor-navy)] hover:text-[var(--betanor-blue)]">{task.title}</Link><p className="mt-2 text-sm text-[var(--betanor-muted)]">{task.projects?.[0] ? `${task.projects[0].project_code} · ${task.projects[0].name}` : "Internal work"}{task.milestones?.[0] ? ` · ${task.milestones[0].title}` : ""}</p>{task.description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-text)]">{task.description}</p> : null}</div><div className="shrink-0 md:text-right"><p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Due</p><p className="mt-1 text-sm font-semibold text-[var(--betanor-navy)]">{task.due_on ?? "Not scheduled"}</p><form action={updateTaskStatus} className="mt-3 flex gap-2 md:justify-end"><input type="hidden" name="taskId" value={task.id}/><select name="status" defaultValue={task.status} className="min-h-9 rounded-lg border border-[var(--betanor-border)] bg-white px-2 text-xs"><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select><Button type="submit" size="sm" variant="outline">Update</Button></form></div></div></Card>)}</div>}</main>;
}
