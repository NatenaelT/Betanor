import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createProject } from "@/app/workspace/projects/actions";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "blocked" || status === "cancelled") return "danger" as const;
  if (status === "in_progress") return "info" as const;
  return "draft" as const;
}

const notices: Record<string, string> = {
  access: "Your account does not have project management access.",
  validation: "Check the project name, date range, and budget, then try again.",
  create: "The project could not be created. Check customer and contract links and try again.",
};

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  const [{ error: errorCode, deleted }, supabase] = await Promise.all([searchParams, createClient()]);
  const access = await resolveWorkspace(supabase);
  const canManageProjects = access.hasStaffRole && access.permissions.has("project.manage");
  const [customers, contracts, employees, departments, projects] = await Promise.all([
    supabase.from("customers").select("id,name").order("name"),
    supabase.from("contracts").select("id,title").order("created_at", { ascending: false }),
    canManageProjects ? supabase.from("employees").select("id,first_name,last_name,employee_number").eq("employment_status", "active").order("first_name") : Promise.resolve({ data: [] }),
    canManageProjects ? supabase.from("departments").select("id,name").eq("is_active", true).order("name") : Promise.resolve({ data: [] }),
    supabase.from("projects").select("id,project_code,name,status,starts_on,ends_on,budget_amount,customers(name),contracts(title),milestones(id)").order("created_at", { ascending: false }).limit(100),
  ]);
  const projectRows = projects.data ?? [];

  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
    <p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Work · Administration</p>
    <h1 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">Projects</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Manage delivery projects and keep their customer, contract, budget, and workstream links current.</p>

    {deleted ? <Card className="mt-6 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Project deleted. Linked task history remains available in the work queue.</Card> : null}
    {errorCode && notices[errorCode] ? <Card className="mt-6 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{notices[errorCode]}</Card> : null}

    {canManageProjects ? <Card className="mt-8 p-5 sm:p-6">
      <div className="mb-5"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Create a project</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">Project references are generated automatically. Customer, contract, dates, and budget are optional.</p></div>
      <form action={createProject} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="sm:col-span-2"><FieldLabel required htmlFor="project-name">Project name</FieldLabel><Input id="project-name" name="name" required maxLength={180} placeholder="Project or delivery engagement"/></div>
        <div><FieldLabel htmlFor="project-customer">Customer</FieldLabel><select id="project-customer" name="customerId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Internal project</option>{customers.data?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div>
        <div><FieldLabel htmlFor="project-contract">Contract</FieldLabel><select id="project-contract" name="contractId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No linked contract</option>{contracts.data?.map((contract) => <option key={contract.id} value={contract.id}>{contract.title}</option>)}</select></div>
        <div><FieldLabel htmlFor="project-department">Department</FieldLabel><select id="project-department" name="departmentId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No department</option>{departments.data?.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
        <div><FieldLabel htmlFor="project-manager">Project manager</FieldLabel><select id="project-manager" name="projectManagerId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Not assigned</option>{employees.data?.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name} · {employee.employee_number}</option>)}</select></div>
        <div><FieldLabel htmlFor="project-budget">Budget</FieldLabel><Input id="project-budget" name="budget" min="0" step="0.01" type="number" placeholder="Optional amount"/></div>
        <div><FieldLabel htmlFor="project-currency">Currency</FieldLabel><Input id="project-currency" name="currencyCode" maxLength={3} defaultValue="ETB"/></div>
        <div><FieldLabel htmlFor="project-start">Start date</FieldLabel><Input id="project-start" name="startsOn" type="date"/></div>
        <div><FieldLabel htmlFor="project-end">End date</FieldLabel><Input id="project-end" name="endsOn" type="date"/></div>
        <div className="sm:col-span-2 xl:col-span-3"><FieldLabel htmlFor="project-description">Description / scope</FieldLabel><textarea id="project-description" name="description" rows={3} maxLength={5000} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="Scope, key outcomes, or delivery context"/></div>
        <div className="sm:col-span-2 xl:col-span-3"><Button type="submit">Create project</Button></div>
      </form>
    </Card> : <Card className="mt-8 p-5 text-sm text-[var(--betanor-muted)]">Project creation and administration are available to users with the project.manage permission.</Card>}

    <div className="mt-10 flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold text-[var(--betanor-navy)]">Active delivery portfolio</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">{projectRows.length} project{projectRows.length === 1 ? "" : "s"} visible to your role.</p></div></div>
    {projects.error ? <Card className="mt-4 p-6 text-sm text-[var(--betanor-danger)]">Projects could not be loaded. Check that your staff role includes Work access.</Card> : projectRows.length === 0 ? <Card className="mt-4 p-8 text-center"><p className="font-semibold text-[var(--betanor-navy)]">No projects found</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">Projects linked to a customer, contract, or internal initiative will appear here.</p></Card> : <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projectRows.map((project) => <Card key={project.id} className="flex h-full flex-col p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/workspace/projects/${project.id}`} className="font-semibold text-[var(--betanor-navy)] hover:text-[var(--betanor-blue)]">{project.name}</Link><p className="mt-1 text-xs text-[var(--betanor-muted)]">{project.project_code}</p></div><Badge tone={statusTone(project.status)}>{titleCase(project.status)}</Badge></div><p className="mt-4 text-sm text-[var(--betanor-muted)]">{project.customers?.[0]?.name || "Internal project"} · {project.budget_amount ? `ETB ${project.budget_amount}` : "Budget to be confirmed"}</p><p className="mt-2 text-xs text-[var(--betanor-muted)]">{project.starts_on || "Start date not set"} → {project.ends_on || "End date not set"} · {project.milestones?.length ?? 0} milestone{project.milestones?.length === 1 ? "" : "s"}</p><Link href={`/workspace/projects/${project.id}`} className="mt-auto pt-5 text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Manage project →</Link></Card>)}</div>}
  </main>;
}
