import Link from "next/link";

import { createProject } from "@/app/workspace/projects/actions";
import { ProjectPortfolio, type ProjectPortfolioItem } from "@/components/projects/project-portfolio";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { PageControls } from "@/components/ui/page-controls";
import { createClient } from "@/lib/supabase/server";
import { relationArray } from "@/lib/supabase/relations";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

const notices: Record<string, string> = {
  access: "Your account does not have project management access.",
  validation: "Check the project name, date range, and budget, then try again.",
  create: "The project could not be created. Check customer and contract links and try again.",
};

const PAGE_SIZE = 24;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string; page?: string }> }) {
  const [{ error: errorCode, deleted, page: rawPage }, supabase] = await Promise.all([searchParams, createClient()]);
  const page = Math.max(1, Math.min(5000, Number(rawPage) || 1));
  const access = await resolveWorkspace(supabase);
  const canManageProjects = access.hasStaffRole && access.permissions.has("project.manage");
  const [customers, contracts, employees, departments, projects] = await Promise.all([
    canManageProjects ? supabase.from("customers").select("id,name").order("name").limit(200) : Promise.resolve({ data: [] }),
    canManageProjects ? supabase.from("contracts").select("id,title").order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
    canManageProjects ? supabase.from("employees").select("id,first_name,last_name,employee_number").eq("employment_status", "active").order("first_name").limit(200) : Promise.resolve({ data: [] }),
    canManageProjects ? supabase.from("departments").select("id,name").eq("status", "active").order("name").limit(200) : Promise.resolve({ data: [] }),
    access.workspaceId ? supabase.from("projects").select("id,project_code,name,status,starts_on,ends_on,budget_amount,currency_code,customers(name),milestones(count),tasks(count)").eq("workspace_id", access.workspaceId).order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE) : Promise.resolve({ data: [], error: null }),
  ]);
  const hasNextPage = (projects.data?.length ?? 0) > PAGE_SIZE;
  const projectRows = (projects.data ?? []).slice(0, PAGE_SIZE).map((project): ProjectPortfolioItem => ({
    id: project.id,
    project_code: project.project_code,
    name: project.name,
    status: project.status,
    customer: relationArray(project.customers)[0]?.name || "Internal project",
    budget_amount: project.budget_amount === null ? null : Number(project.budget_amount),
    currency_code: project.currency_code || "ETB",
    starts_on: project.starts_on,
    ends_on: project.ends_on,
    milestone_count: Number((project.milestones?.[0] as { count?: number } | undefined)?.count ?? project.milestones?.length ?? 0),
    task_count: Number((project.tasks?.[0] as { count?: number } | undefined)?.count ?? project.tasks?.length ?? 0),
  }));

  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Work · Portfolio</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Projects</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Plan delivery across customers, teams, milestones, tasks, dates, and budgets from one working portfolio.</p></div><Link href="/workspace/tasks" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Open task workspace →</Link></div>

    {deleted ? <Card className="mt-6 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Project deleted. Linked task history remains available in the work queue.</Card> : null}
    {errorCode && notices[errorCode] ? <Card className="mt-6 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{notices[errorCode]}</Card> : null}

    {canManageProjects ? <Card className="mt-7 overflow-hidden">
      <details>
        <summary className="group flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span><span className="block font-semibold text-[var(--betanor-navy)]">Create a project</span><span className="mt-1 block text-sm text-[var(--betanor-muted)]">Project code is automatic; the customer, dates, budget, and manager are optional.</span></span>
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--betanor-border)] text-lg text-[var(--betanor-navy)] transition group-open:rotate-45">+</span>
        </summary>
        <form action={createProject} className="grid gap-4 border-t border-[var(--betanor-border)] bg-slate-50/70 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
          <div className="sm:col-span-2"><FieldLabel required htmlFor="project-name">Project name</FieldLabel><Input id="project-name" name="name" required maxLength={180} placeholder="Project or delivery engagement" /></div>
          <div><FieldLabel htmlFor="project-customer">Customer</FieldLabel><select id="project-customer" name="customerId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Internal project</option>{customers.data?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div>
          <div><FieldLabel htmlFor="project-contract">Contract</FieldLabel><select id="project-contract" name="contractId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No linked contract</option>{contracts.data?.map((contract) => <option key={contract.id} value={contract.id}>{contract.title}</option>)}</select></div>
          <div><FieldLabel htmlFor="project-department">Department</FieldLabel><select id="project-department" name="departmentId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No department</option>{departments.data?.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
          <div><FieldLabel htmlFor="project-manager">Project manager</FieldLabel><select id="project-manager" name="projectManagerId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Not assigned</option>{employees.data?.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name} · {employee.employee_number}</option>)}</select></div>
          <div><FieldLabel htmlFor="project-budget">Budget</FieldLabel><Input id="project-budget" name="budget" min="0" step="0.01" type="number" placeholder="Optional amount" /></div>
          <div><FieldLabel htmlFor="project-currency">Currency</FieldLabel><Input id="project-currency" name="currencyCode" maxLength={3} defaultValue="ETB" /></div>
          <div><FieldLabel htmlFor="project-start">Start date</FieldLabel><Input id="project-start" name="startsOn" type="date" /></div>
          <div><FieldLabel htmlFor="project-end">End date</FieldLabel><Input id="project-end" name="endsOn" type="date" /></div>
          <div className="sm:col-span-2 xl:col-span-3"><FieldLabel htmlFor="project-description">Description / scope</FieldLabel><textarea id="project-description" name="description" rows={3} maxLength={5000} className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm" placeholder="Scope, key outcomes, or delivery context" /></div>
          <div className="sm:col-span-2 xl:col-span-3"><Button type="submit">Create project</Button></div>
        </form>
      </details>
    </Card> : <Card className="mt-7 p-5 text-sm text-[var(--betanor-muted)]">Project creation and administration are available to users with the project.manage permission.</Card>}

    {projects.error ? <Card className="mt-6 p-6 text-sm text-[var(--betanor-danger)]">Projects could not be loaded. Check that your staff role includes Work access.</Card> : <><ProjectPortfolio projects={projectRows} /><PageControls page={page} hasPrevious={page > 1} hasNext={hasNextPage} hrefForPage={(next) => `/workspace/projects?page=${next}`} /></>}
  </main>;
}
