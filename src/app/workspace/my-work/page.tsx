import Link from "next/link";
import { revalidatePath } from "next/cache";

import { MyWorkQueue, type MyWorkItem } from "@/components/tasks/my-work-queue";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { relationArray } from "@/lib/supabase/relations";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

async function updateTaskStatus(data: FormData) {
  "use server";
  const taskId = String(data.get("taskId") ?? "");
  const status = String(data.get("status") ?? "");
  if (!taskId || !["not_started", "in_progress", "blocked", "completed", "cancelled"].includes(status)) return;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.hasStaffRole) return;
  const { error } = await supabase.rpc("update_assigned_task_status", { task_id_input: taskId, status_input: status });
  if (error) return;
  revalidatePath("/workspace/my-work");
  revalidatePath("/workspace/tasks");
  revalidatePath(`/workspace/tasks/${taskId}`);
}

const taskSelect = "id,task_code,title,status,priority,due_on,description,created_by,projects(name,project_code),milestones(title),task_assignees(employee_id,employees(first_name,last_name,employee_number))";
const assignedTaskSelect = "id,task_code,title,status,priority,due_on,description,created_by,projects(name,project_code),milestones(title),task_assignees!inner(employee_id,employees(first_name,last_name,employee_number))";

export default async function MyWorkPage() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  const userId = access.userId;
  const { data: employee } = userId ? await supabase.from("employees").select("id,first_name,last_name,employee_number,department_id").eq("profile_id", userId).maybeSingle() : { data: null };

  const [assignedResult, createdResult] = await Promise.all([
    employee ? supabase.from("tasks").select(assignedTaskSelect).eq("task_assignees.employee_id", employee.id).order("due_on", { ascending: true, nullsFirst: false }).limit(200) : Promise.resolve(null),
    userId ? supabase.from("tasks").select(taskSelect).eq("created_by", userId).order("due_on", { ascending: true, nullsFirst: false }).limit(200) : Promise.resolve(null),
  ]);
  const combined = [...(assignedResult?.data ?? []), ...(createdResult?.data ?? [])];
  const uniqueTasks = [...new Map(combined.map((task) => [task.id, task])).values()];
  const error = assignedResult?.error || createdResult?.error;
  const tasks: MyWorkItem[] = uniqueTasks.map((task) => {
    const project = relationArray(task.projects)[0];
    const milestone = relationArray(task.milestones)[0];
    const assignments = (task.task_assignees ?? []).map((assignment) => ({ ...assignment, employees: relationArray(assignment.employees) }));
    return {
      id: task.id,
      task_code: task.task_code,
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_on: task.due_on,
      description: task.description,
      project_label: project ? `${project.project_code} · ${project.name}` : "Internal work",
      milestone_label: milestone?.title ?? null,
      created_by_me: task.created_by === userId,
      assigned_employee_ids: assignments.map((assignment) => assignment.employee_id),
      owners: assignments.map((assignment) => `${assignment.employees[0]?.first_name ?? ""} ${assignment.employees[0]?.last_name ?? ""}`.trim()).filter(Boolean),
    };
  });
  const canManageAllTasks = access.hasStaffRole && ["task.create", "task.assign", "task.edit", "project.manage"].some((permission) => access.permissions.has(permission));
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Addis_Ababa" }).format(new Date());

  return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Work module</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">My Work</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Your tasks in one place—what is due now, what is next, what is finished, and what you have delegated.</p></div>{canManageAllTasks ? <Link href="/workspace/tasks" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--betanor-border)] bg-white px-4 text-sm font-semibold text-[var(--betanor-blue)] hover:bg-slate-50">Manage all tasks →</Link> : null}</div>
    {employee ? <div className="mt-6 flex flex-col justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-900 sm:flex-row sm:items-center"><span>Signed in as <strong>{employee.first_name} {employee.last_name}</strong> · {employee.employee_number}</span><span className="text-xs text-blue-800/70">Your company workweek is Monday–Friday · 40 hours</span></div> : <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">No employee profile is linked to this login yet. Showing tasks you created; an HR administrator can link your staff profile.</div>}
    {error ? <Card className="mt-6 p-6 text-sm text-[var(--betanor-danger)]">Your work could not be loaded. Check your task access and assignment.</Card> : <MyWorkQueue tasks={tasks} employeeId={employee?.id ?? null} today={today} updateTaskStatus={updateTaskStatus} />}
  </main>;
}
