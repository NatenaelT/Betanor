import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { updateProject } from "@/app/workspace/projects/actions";
import { createClient } from "@/lib/supabase/server";
import { relationArray } from "@/lib/supabase/relations";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

async function addMilestone(data: FormData) {
  "use server";
  const projectId = String(data.get("projectId") ?? "").trim();
  const title = String(data.get("title") ?? "").trim();
  if (!projectId || !title) return;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.hasStaffRole || !access.permissions.has("project.manage")) return;
  const { error } = await supabase.from("milestones").insert({
    project_id: projectId,
    title,
    description: String(data.get("description") ?? "").trim() || null,
    due_on: String(data.get("dueOn") ?? "") || null,
  });
  if (error) return;
  revalidatePath(`/workspace/projects/${projectId}`);
  revalidatePath("/workspace/tasks");
}

async function updateMilestone(data: FormData) {
  "use server";
  const projectId = String(data.get("projectId") ?? "").trim();
  const milestoneId = String(data.get("milestoneId") ?? "").trim();
  const status = String(data.get("status") ?? "");
  if (!projectId || !milestoneId || !["not_started", "in_progress", "blocked", "completed"].includes(status)) return;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.hasStaffRole || !access.permissions.has("project.manage")) return;
  await supabase.from("milestones").update({ status }).eq("id", milestoneId).eq("project_id", projectId);
  revalidatePath(`/workspace/projects/${projectId}`);
}

function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function tone(status: string) { return status === "completed" ? "success" as const : status === "blocked" || status === "cancelled" ? "danger" as const : status === "in_progress" ? "info" as const : "draft" as const; }

const projectStatuses = ["not_started", "in_progress", "blocked", "completed", "cancelled"];

export default async function ProjectDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error: errorCode }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  const canManageProjects = access.hasStaffRole && access.permissions.has("project.manage");
  const [projectResult, customersResult, contractsResult, employeesResult, departmentsResult] = await Promise.all([
    supabase.from("projects").select("id,workspace_id,project_code,name,status,description,starts_on,ends_on,budget_amount,currency_code,customer_id,contract_id,department_id,project_manager_id,customers(name),contracts(title),milestones(id,title,description,due_on,status),tasks(id,task_code,title,status,priority,due_on,milestone_id)").eq("id", id).maybeSingle(),
    canManageProjects ? supabase.from("customers").select("id,name").order("name") : Promise.resolve({ data: [] }),
    canManageProjects ? supabase.from("contracts").select("id,title").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    canManageProjects ? supabase.from("employees").select("id,first_name,last_name,employee_number").eq("employment_status", "active").order("first_name") : Promise.resolve({ data: [] }),
    canManageProjects ? supabase.from("departments").select("id,name").eq("status", "active").order("name") : Promise.resolve({ data: [] }),
  ]);
  const { data: projectData, error } = projectResult;
  if (error || !projectData) notFound();
  const project = { ...projectData, customers: relationArray(projectData.customers), contracts: relationArray(projectData.contracts) };
  const milestones = project.milestones ?? [];
  const tasks = project.tasks ?? [];

  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
    <Link href="/workspace/projects" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">← Back to projects</Link>
    <div className="mt-5 flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={tone(project.status)}>{titleCase(project.status)}</Badge><span className="text-xs text-[var(--betanor-muted)]">{project.project_code}</span></div><h1 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">{project.name}</h1><p className="mt-2 text-sm text-[var(--betanor-muted)]">{project.customers?.[0]?.name || "Internal delivery"}{project.contracts?.[0] ? ` · Contract: ${project.contracts[0].title}` : ""}</p></div><div className="flex flex-wrap items-center gap-3"><Link href="/workspace/tasks" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Work queue →</Link>{canManageProjects ? <DeleteProjectButton projectId={project.id}/> : null}</div></div>

    {errorCode ? <Card role="alert" className="mt-6 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{errorCode === "validation" ? "Check the required project name, date range, and budget." : errorCode === "delete" ? "Project deletion was blocked or did not complete. Review linked records; task history is preserved and the database protects records that still require this project." : "Project changes could not be saved. Check your permissions and linked records."}</Card> : null}

    <div className="mt-8 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
      <Card className="p-5 sm:p-6">
        {canManageProjects ? <><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Project administration</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">Update the project record, ownership, dates, and budget.</p>
          <form action={updateProject} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="projectId" value={project.id}/>
            <div className="sm:col-span-2"><FieldLabel required htmlFor="project-edit-name">Project name</FieldLabel><Input id="project-edit-name" name="name" defaultValue={project.name} required maxLength={180}/></div>
            <div><FieldLabel htmlFor="project-edit-status">Status</FieldLabel><select id="project-edit-status" name="status" defaultValue={project.status} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm">{projectStatuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></div>
            <div><FieldLabel htmlFor="project-edit-customer">Customer</FieldLabel><select id="project-edit-customer" name="customerId" defaultValue={project.customer_id ?? ""} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Internal project</option>{customersResult.data?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div>
            <div className="sm:col-span-2"><FieldLabel htmlFor="project-edit-contract">Contract</FieldLabel><select id="project-edit-contract" name="contractId" defaultValue={project.contract_id ?? ""} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No linked contract</option>{contractsResult.data?.map((contract) => <option key={contract.id} value={contract.id}>{contract.title}</option>)}</select></div>
            <div><FieldLabel htmlFor="project-edit-start">Start date</FieldLabel><Input id="project-edit-start" name="startsOn" type="date" defaultValue={project.starts_on ?? ""}/></div>
            <div><FieldLabel htmlFor="project-edit-end">End date</FieldLabel><Input id="project-edit-end" name="endsOn" type="date" defaultValue={project.ends_on ?? ""}/></div>
            <div><FieldLabel htmlFor="project-edit-budget">Budget</FieldLabel><Input id="project-edit-budget" name="budget" min="0" step="0.01" type="number" defaultValue={project.budget_amount ?? ""}/></div>
            <div><FieldLabel htmlFor="project-edit-currency">Currency</FieldLabel><Input id="project-edit-currency" name="currencyCode" maxLength={3} defaultValue={project.currency_code}/></div>
            <div><FieldLabel htmlFor="project-edit-department">Department</FieldLabel><select id="project-edit-department" name="departmentId" defaultValue={project.department_id ?? ""} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No department</option>{departmentsResult.data?.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
            <div><FieldLabel htmlFor="project-edit-manager">Project manager</FieldLabel><select id="project-edit-manager" name="projectManagerId" defaultValue={project.project_manager_id ?? ""} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Not assigned</option>{employeesResult.data?.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name} · {employee.employee_number}</option>)}</select></div>
            <div className="sm:col-span-2"><FieldLabel htmlFor="project-edit-description">Description / scope</FieldLabel><textarea id="project-edit-description" name="description" rows={4} maxLength={5000} defaultValue={project.description ?? ""} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm"/></div>
            <div className="sm:col-span-2"><Button type="submit">Save project changes</Button></div>
          </form>
        </> : <><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Project brief</h2><p className="mt-3 text-sm leading-6 text-[var(--betanor-text)]">{project.description || "No project brief has been recorded yet."}</p><dl className="mt-6 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-[var(--betanor-muted)]">Delivery window</dt><dd className="mt-1 font-semibold text-[var(--betanor-navy)]">{project.starts_on || "—"} → {project.ends_on || "—"}</dd></div><div><dt className="text-xs text-[var(--betanor-muted)]">Budget</dt><dd className="mt-1 font-semibold text-[var(--betanor-navy)]">{project.budget_amount ? `${project.currency_code} ${project.budget_amount}` : "To be confirmed"}</dd></div></dl></>}
        {canManageProjects ? <div className="mt-8 border-t border-[var(--betanor-border)] pt-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Add milestone</h2><form action={addMilestone} className="mt-4 space-y-3"><input type="hidden" name="projectId" value={project.id}/><div><FieldLabel required htmlFor="milestone-title">Milestone</FieldLabel><Input id="milestone-title" name="title" required maxLength={180} placeholder="e.g. Site acceptance and handover"/></div><div><FieldLabel htmlFor="milestone-due">Due date</FieldLabel><Input id="milestone-due" name="dueOn" type="date"/></div><textarea name="description" rows={2} maxLength={3000} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="Acceptance criteria"/><Button type="submit" size="sm">Add milestone</Button></form></div> : null}
      </Card>

      <div className="space-y-6">
        <Card className="p-5 sm:p-6"><div><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Milestones</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">{milestones.length} milestone{milestones.length === 1 ? "" : "s"}</p></div>{milestones.length ? <div className="mt-4 space-y-3">{milestones.map((milestone) => <div key={milestone.id} className="rounded-lg border border-[var(--betanor-border)] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[var(--betanor-navy)]">{milestone.title}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Due {milestone.due_on || "not scheduled"}</p></div><Badge tone={tone(milestone.status)}>{titleCase(milestone.status)}</Badge></div>{milestone.description ? <p className="mt-3 text-sm text-[var(--betanor-text)]">{milestone.description}</p> : null}{canManageProjects ? <form action={updateMilestone} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="projectId" value={project.id}/><input type="hidden" name="milestoneId" value={milestone.id}/><select name="status" defaultValue={milestone.status} aria-label="Milestone status" className="min-h-9 rounded-lg border border-[var(--betanor-border)] bg-white px-2 text-xs">{["not_started", "in_progress", "blocked", "completed"].map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select><Button type="submit" size="sm" variant="outline">Update</Button></form> : null}</div>)}</div> : <p className="mt-4 text-sm text-[var(--betanor-muted)]">No milestones have been recorded.</p>}</Card>

        <Card className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Project tasks</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">{tasks.length} linked task{tasks.length === 1 ? "" : "s"}</p></div>{canManageProjects ? <Link href="/workspace/tasks" className="text-xs font-semibold text-[var(--betanor-blue)] hover:underline">Add task</Link> : null}</div>{tasks.length ? <div className="mt-4 divide-y divide-[var(--betanor-border)]">{tasks.map((task) => <div key={task.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><Link href={`/workspace/tasks/${task.id}`} className="font-semibold text-[var(--betanor-navy)] hover:text-[var(--betanor-blue)]">{task.title}</Link><p className="mt-1 text-xs text-[var(--betanor-muted)]">{task.task_code} · {task.due_on ? `Due ${task.due_on}` : "No due date"} · {titleCase(task.priority)} priority</p></div><Badge tone={tone(task.status)}>{titleCase(task.status)}</Badge></div>)}</div> : <p className="mt-4 text-sm text-[var(--betanor-muted)]">No linked tasks. Add one from the work queue and choose this project.</p>}</Card>
      </div>
    </div>
  </main>;
}
