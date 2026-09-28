import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { TaskWorkspaceViews, type TaskWorkspaceItem } from "@/components/tasks/task-workspace-views";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { relationArray } from "@/lib/supabase/relations";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

const statusOptions = [["not_started", "Not started"], ["in_progress", "In progress"], ["blocked", "Blocked"], ["completed", "Completed"], ["cancelled", "Cancelled"]] as const;
const priorityOptions = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["urgent", "Urgent"]] as const;

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
  redirect(`/workspace/tasks/${taskId}`);
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const [access, params] = await Promise.all([resolveWorkspace(supabase), searchParams]);
  const canCreateTasks = access.hasStaffRole && access.permissions.has("task.create");
  const canAssignTasks = access.hasStaffRole && access.permissions.has("task.assign");
  const canViewAllTasks = ["task.create", "task.assign", "project.manage"].some((permission) => access.permissions.has(permission));
  const [projects, milestones, employees, employee] = await Promise.all([
    canCreateTasks ? supabase.from("projects").select("id,name,project_code").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    canCreateTasks ? supabase.from("milestones").select("id,title,project_id").order("due_on", { ascending: true }) : Promise.resolve({ data: [] }),
    canAssignTasks ? supabase.from("employees").select("id,first_name,last_name,employee_number").eq("employment_status", "active").not("profile_id", "is", null).order("first_name") : Promise.resolve({ data: [] }),
    access.userId ? supabase.from("employees").select("id").eq("profile_id", access.userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const taskQuery = canViewAllTasks
    ? supabase.from("tasks").select("id,task_code,title,status,priority,starts_on,due_on,project_id,milestone_id,projects(name,project_code),milestones(title),task_assignees(employee_id,employees(first_name,last_name))")
    : employee.data?.id
      ? supabase.from("tasks").select("id,task_code,title,status,priority,starts_on,due_on,project_id,milestone_id,projects(name,project_code),milestones(title),task_assignees!inner(employee_id,employees(first_name,last_name))").eq("task_assignees.employee_id", employee.data.id)
      : supabase.from("tasks").select("id,task_code,title,status,priority,starts_on,due_on,project_id,milestone_id,projects(name,project_code),milestones(title),task_assignees(employee_id,employees(first_name,last_name))").eq("created_by", access.userId ?? "");
  const tasks = await taskQuery.order("due_on", { ascending: true, nullsFirst: false }).limit(200);
  const taskRows: TaskWorkspaceItem[] = (tasks.data ?? []).map((task) => {
    const project = relationArray(task.projects)[0];
    const milestone = relationArray(task.milestones)[0];
    const assignees = (task.task_assignees ?? []).map((assignment) => ({ ...assignment, employees: relationArray(assignment.employees) }));
    return {
      id: task.id,
      task_code: task.task_code,
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_on: task.due_on,
      project_label: project ? `${project.project_code} · ${project.name}` : "Internal work",
      milestone_label: milestone?.title ?? null,
      owners: assignees.map((assignment) => `${assignment.employees[0]?.first_name ?? ""} ${assignment.employees[0]?.last_name ?? ""}`.trim()).filter(Boolean),
    };
  });

  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Work module</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Tasks</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Plan and track assignments across delivery with list, board, and due-date views.</p></div><Link href="/workspace/my-work" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--betanor-border)] bg-white px-4 text-sm font-semibold text-[var(--betanor-blue)] transition hover:bg-slate-50">Open My Work →</Link></div>

    {params.error ? <Card className="mt-6 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">The task could not be saved. Verify your permissions, the selected project/milestone, and the assignee’s active portal account.</Card> : null}
    {canCreateTasks ? <Card className="mt-7 overflow-hidden"><details><summary className="group flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50 sm:px-6 [&::-webkit-details-marker]:hidden"><span><span className="block font-semibold text-[var(--betanor-navy)]">Create a delivery task</span><span className="mt-1 block text-sm text-[var(--betanor-muted)]">Assign an owner, due date, project, or milestone to the next action.</span></span><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--betanor-border)] text-lg transition group-open:rotate-45">+</span></summary><form action={createTask} className="grid gap-4 border-t border-[var(--betanor-border)] bg-slate-50/70 p-5 md:grid-cols-2 lg:grid-cols-3 sm:p-6"><div className="lg:col-span-2"><FieldLabel required htmlFor="task-title">Task title</FieldLabel><Input id="task-title" name="title" required maxLength={180} placeholder="e.g. Validate Addis site network design" /></div><div><FieldLabel htmlFor="task-priority">Priority</FieldLabel><select id="task-priority" name="priority" defaultValue="medium" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm">{priorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><FieldLabel htmlFor="task-project">Project</FieldLabel><select id="task-project" name="projectId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Internal / unlinked</option>{projects.data?.map((project) => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}</select></div><div><FieldLabel htmlFor="task-milestone">Implementation milestone</FieldLabel><select id="task-milestone" name="milestoneId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No milestone</option>{milestones.data?.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select></div>{canAssignTasks ? <div><FieldLabel htmlFor="task-owner">Assign to staff member</FieldLabel><select id="task-owner" name="employeeId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Unassigned</option>{employees.data?.map((person) => <option key={person.id} value={person.id}>{person.first_name} {person.last_name} · {person.employee_number}</option>)}</select><p className="mt-1 text-xs text-[var(--betanor-muted)]">Only active employees with a linked portal account are shown.</p></div> : null}<div><FieldLabel htmlFor="task-status">Status</FieldLabel><select id="task-status" name="status" defaultValue="not_started" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm">{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><FieldLabel htmlFor="task-start">Starts on</FieldLabel><Input id="task-start" name="startsOn" type="date" /></div><div><FieldLabel htmlFor="task-due">Due on</FieldLabel><Input id="task-due" name="dueOn" type="date" /></div><div className="md:col-span-2 lg:col-span-3"><FieldLabel htmlFor="task-description">Scope / acceptance notes</FieldLabel><textarea id="task-description" name="description" rows={3} maxLength={4000} className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm" placeholder="What must be delivered, checked, or accepted?" /></div><div className="lg:col-span-3"><Button type="submit">Add task</Button></div></form></details></Card> : null}

    {tasks.error ? <Card className="mt-6 p-6 text-sm text-[var(--betanor-danger)]">Tasks could not be loaded. Check that your staff role includes Work access.</Card> : <TaskWorkspaceViews tasks={taskRows} />}
  </main>;
}
