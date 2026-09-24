import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

const statusOptions = [
  ["not_started", "Not started"],
  ["in_progress", "In progress"],
  ["blocked", "Blocked"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
] as const;
const priorityOptions = [
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["urgent", "Urgent"],
] as const;

async function createTask(data: FormData) {
  "use server";
  const title = String(data.get("title") ?? "").trim();
  if (!title) return;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.hasStaffRole || !access.permissions.has("task.create")) redirect("/workspace/tasks?error=create");
  const projectId = String(data.get("projectId") ?? "") || null;
  const milestoneId = String(data.get("milestoneId") ?? "") || null;
  const employeeId = String(data.get("employeeId") ?? "") || null;
  if (employeeId && !access.permissions.has("task.assign")) redirect("/workspace/tasks?error=create");
  const { data: taskId, error } = await supabase.rpc("create_task_with_assignee", {
    workspace_id_input: access.workspaceId,
    project_id_input: projectId,
    milestone_id_input: milestoneId,
    title_input: title,
    description_input: String(data.get("description") ?? "").trim() || null,
    status_input: String(data.get("status") ?? "not_started"),
    priority_input: String(data.get("priority") ?? "medium"),
    starts_on_input: String(data.get("startsOn") ?? "") || null,
    due_on_input: String(data.get("dueOn") ?? "") || null,
    employee_id_input: employeeId,
  });
  if (error || !taskId) redirect("/workspace/tasks?error=create");
  revalidatePath("/workspace/tasks");
  revalidatePath("/workspace/my-work");
  revalidatePath(`/workspace/tasks/${taskId}`);
}

function statusTone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "blocked" || status === "cancelled") return "danger" as const;
  if (status === "in_progress") return "info" as const;
  return "draft" as const;
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const [access, params] = await Promise.all([resolveWorkspace(supabase), searchParams]);
  const canCreateTasks = access.hasStaffRole && access.permissions.has("task.create");
  const canAssignTasks = access.hasStaffRole && access.permissions.has("task.assign");
  const [projects, milestones, employees, tasks] = await Promise.all([
    canCreateTasks ? supabase.from("projects").select("id,name,project_code").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    canCreateTasks ? supabase.from("milestones").select("id,title,project_id").order("due_on", { ascending: true }) : Promise.resolve({ data: [] }),
    canAssignTasks ? supabase.from("employees").select("id,first_name,last_name,employee_number").eq("employment_status", "active").not("profile_id", "is", null).order("first_name") : Promise.resolve({ data: [] }),
    supabase.from("tasks").select("id,task_code,title,status,priority,starts_on,due_on,project_id,milestone_id,projects(name,project_code),milestones(title),task_assignees(employee_id,employees(first_name,last_name))").order("due_on", { ascending: true, nullsFirst: false }).limit(100),
  ]);
  const taskRows = tasks.data ?? [];

  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Work module</p><h1 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">Turn delivery plans into accountable work.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Coordinate Ethiopian delivery teams with clear owners, milestones, due dates, and acceptance notes from one operational queue.</p></div>
      <Link href="/workspace/my-work" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Open my work →</Link>
    </div>

    {params.error ? <Card className="mt-6 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">The task could not be saved. Verify your permissions, the selected project/milestone, and the assignee’s active portal account.</Card> : null}
    {canCreateTasks ? <Card className="mt-8 p-5 sm:p-6"><div className="mb-5"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Create a delivery task</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">Assign a concrete next action to a project or internal workstream. Task reference and assignment notifications are automatic.</p></div><form action={createTask} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><div className="lg:col-span-2"><FieldLabel required htmlFor="task-title">Task title</FieldLabel><Input id="task-title" name="title" required maxLength={180} placeholder="e.g. Validate Addis site network design"/></div><div><FieldLabel htmlFor="task-priority">Priority</FieldLabel><select id="task-priority" name="priority" defaultValue="medium" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm">{priorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><FieldLabel htmlFor="task-project">Project</FieldLabel><select id="task-project" name="projectId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Internal / unlinked</option>{projects.data?.map((project) => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}</select></div><div><FieldLabel htmlFor="task-milestone">Implementation milestone</FieldLabel><select id="task-milestone" name="milestoneId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No milestone</option>{milestones.data?.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select></div>{canAssignTasks ? <div><FieldLabel htmlFor="task-owner">Assign to staff member</FieldLabel><select id="task-owner" name="employeeId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Unassigned</option>{employees.data?.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name} · {employee.employee_number}</option>)}</select><p className="mt-1 text-xs text-[var(--betanor-muted)]">Only active employees with a linked portal account are shown.</p></div> : null}<div><FieldLabel htmlFor="task-status">Status</FieldLabel><select id="task-status" name="status" defaultValue="not_started" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm">{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><FieldLabel htmlFor="task-start">Starts on</FieldLabel><Input id="task-start" name="startsOn" type="date"/></div><div><FieldLabel htmlFor="task-due">Due on</FieldLabel><Input id="task-due" name="dueOn" type="date"/></div><div className="md:col-span-2 lg:col-span-3"><FieldLabel htmlFor="task-description">Scope / acceptance notes</FieldLabel><textarea id="task-description" name="description" rows={3} maxLength={4000} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="What must be delivered, checked, or accepted?"/></div><div className="lg:col-span-3"><Button type="submit">Add task to work queue</Button></div></form></Card> : null}

    <div className="mt-10 flex items-center justify-between"><div><h2 className="text-xl font-semibold text-[var(--betanor-navy)]">Delivery queue</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">{taskRows.length} task{taskRows.length === 1 ? "" : "s"} visible to your role.</p></div></div>
    {tasks.error ? <Card className="mt-4 p-6 text-sm text-[var(--betanor-danger)]">Tasks could not be loaded. Check that your staff role includes Work access.</Card> : taskRows.length === 0 ? <Card className="mt-4 p-8 text-center"><p className="font-semibold text-[var(--betanor-navy)]">No tasks yet</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">Create the first task above to start tracking delivery.</p></Card> : <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{taskRows.map((task) => { const project = task.projects?.[0]; const milestone = task.milestones?.[0]; const assignees = task.task_assignees ?? []; return <Card key={task.id} className="flex h-full flex-col p-5"><div className="flex items-start justify-between gap-3"><div><Link href={`/workspace/tasks/${task.id}`} className="font-semibold text-[var(--betanor-navy)] hover:text-[var(--betanor-blue)]">{task.title}</Link><p className="mt-1 text-xs text-[var(--betanor-muted)]">{task.task_code}</p></div><Badge tone={statusTone(task.status)}>{titleCase(task.status)}</Badge></div><p className="mt-3 text-xs text-[var(--betanor-muted)]">{project ? `${project.project_code} · ${project.name}` : "Internal work"}{milestone ? ` · ${milestone.title}` : ""}</p><div className="mt-4 flex flex-wrap gap-2"><Badge tone={task.priority === "urgent" ? "danger" : task.priority === "high" ? "warning" : "neutral"}>{titleCase(task.priority)} priority</Badge>{task.due_on ? <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-600">Due {task.due_on}</span> : <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-500">No due date</span>}</div><div className="mt-auto pt-5"><p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Owner{assignees.length > 1 ? "s" : ""}</p><p className="mt-1 text-sm text-[var(--betanor-text)]">{assignees.length ? assignees.map((assignment) => `${assignment.employees?.[0]?.first_name ?? ""} ${assignment.employees?.[0]?.last_name ?? ""}`.trim()).join(", ") : "Unassigned"}</p></div></Card>; })}</div>}
  </main>;
}
