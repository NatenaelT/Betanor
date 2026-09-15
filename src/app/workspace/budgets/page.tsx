import Link from "next/link";
import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { financeTone, formatEtb, titleCase } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

async function createBudget(data: FormData) {
  "use server";
  const workspaceId = String(data.get("workspaceId") ?? "");
  const fiscalYear = Number(data.get("fiscalYear") ?? 0);
  const plannedAmount = Number(data.get("plannedAmount") ?? 0);
  if (!workspaceId || !Number.isInteger(fiscalYear) || fiscalYear < 2020 || fiscalYear > 2200 || !Number.isFinite(plannedAmount) || plannedAmount <= 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("budgets").insert({ workspace_id: workspaceId, fiscal_year: fiscalYear, planned_amount: plannedAmount, currency_code: "ETB", department_id: String(data.get("departmentId") ?? "") || null, project_id: String(data.get("projectId") ?? "") || null, category_id: String(data.get("categoryId") ?? "") || null, status: "draft" });
  if (!error) { revalidatePath("/workspace/budgets"); revalidatePath("/workspace/finance"); }
}

async function approveBudget(budgetId: string) {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase.from("budgets").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", budgetId).eq("status", "draft");
  if (!error) { revalidatePath("/workspace/budgets"); revalidatePath("/workspace/finance"); }
}

export default async function BudgetsPage() {
  const supabase = await createClient();
  const { workspaceId } = await resolveWorkspace(supabase);
  const currentYear = new Date().getFullYear();
  const [departmentsResult, projectsResult, categoriesResult, budgetsResult, expensesResult] = workspaceId
    ? await Promise.all([
      supabase.from("departments").select("id,name,code").eq("workspace_id", workspaceId).order("name"),
      supabase.from("projects").select("id,name,project_code").eq("workspace_id", workspaceId).order("name"),
      supabase.from("finance_categories").select("id,name,category_type").eq("workspace_id", workspaceId).order("name"),
      supabase.from("budgets").select("id,fiscal_year,planned_amount,currency_code,status,department_id,project_id,category_id,departments(name),projects(name),finance_categories(name)").eq("workspace_id", workspaceId).order("fiscal_year", { ascending: false }).order("created_at", { ascending: false }).limit(80),
      supabase.from("expenses").select("amount,status,project_id,category_id").eq("workspace_id", workspaceId).eq("status", "approved"),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [], error: null }, { data: [] }];
  const budgets = budgetsResult.data ?? [];
  const approvedExpenses = expensesResult.data ?? [];
  const currentPlan = budgets.filter((budget) => budget.fiscal_year === currentYear).reduce((sum, budget) => sum + Number(budget.planned_amount ?? 0), 0);
  const currentSpend = approvedExpenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);

  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Finance · budgets</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Plan spend before it becomes spend.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Create ETB budget lines by fiscal year, department, project, or cost category. Drafts remain editable until a finance approver locks the baseline.</p></div><Link href="/workspace/finance" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">← Finance overview</Link></div>{!workspaceId ? <Card className="mt-8 p-6">Finance access is required.</Card> : <>
    <div className="mt-8 grid gap-4 sm:grid-cols-3"><Card className="p-5"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">{currentYear} plan</p><p className="mt-2 text-2xl font-semibold text-[var(--betanor-navy)]">{formatEtb(currentPlan)}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Approved and draft lines</p></Card><Card className="p-5"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">Approved spend</p><p className="mt-2 text-2xl font-semibold text-[var(--betanor-navy)]">{formatEtb(currentSpend)}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Across approved expenses</p></Card><Card className="p-5"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">Utilisation</p><p className="mt-2 text-2xl font-semibold text-[var(--betanor-navy)]">{currentPlan > 0 ? `${Math.round((currentSpend / currentPlan) * 100)}%` : "—"}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Directional management view</p></Card></div>
    <Card className="mt-8 p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Create budget line</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">Use one line for each accountable owner or project. Amounts are recorded in ETB.</p><form action={createBudget} className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4"><input type="hidden" name="workspaceId" value={workspaceId}/><div><FieldLabel htmlFor="budget-year">Fiscal year</FieldLabel><Input id="budget-year" defaultValue={currentYear} min="2020" name="fiscalYear" required type="number"/></div><div><FieldLabel htmlFor="budget-amount">Planned amount (ETB)</FieldLabel><Input id="budget-amount" min="0.01" name="plannedAmount" required step="0.01" type="number"/></div><div><FieldLabel htmlFor="budget-department">Department owner</FieldLabel><select id="budget-department" name="departmentId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No department owner</option>{departmentsResult.data?.map((department) => <option key={department.id} value={department.id}>{department.name} · {department.code}</option>)}</select></div><div><FieldLabel htmlFor="budget-category">Cost category</FieldLabel><select id="budget-category" name="categoryId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No category assigned</option>{categoriesResult.data?.map((category) => <option key={category.id} value={category.id}>{category.name} · {titleCase(category.category_type)}</option>)}</select></div><div className="md:col-span-2 lg:col-span-4"><FieldLabel htmlFor="budget-project">Project allocation</FieldLabel><select id="budget-project" name="projectId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No project allocation</option>{projectsResult.data?.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.project_code}</option>)}</select></div><div className="md:col-span-2 lg:col-span-4"><Button type="submit">Save budget draft</Button></div></form></Card>
    <Card className="mt-8 overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--betanor-border)] px-5 py-4"><div><h2 className="font-semibold text-[var(--betanor-navy)]">Budget register</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">{budgets.length} line{budgets.length === 1 ? "" : "s"} visible to this role.</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold tracking-wide text-[var(--betanor-blue)]">ETB</span></div>{budgets.length ? <div className="divide-y divide-[var(--betanor-border)]">{budgets.map((budget) => { const spent = approvedExpenses.filter((expense) => (budget.project_id && expense.project_id === budget.project_id) || (budget.category_id && expense.category_id === budget.category_id)).reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0); return <div key={budget.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[var(--betanor-navy)]">{budget.fiscal_year} · {budget.departments?.[0]?.name || "Workspace"}</p><Badge tone={financeTone(budget.status)}>{titleCase(budget.status)}</Badge></div><p className="mt-1 text-xs text-[var(--betanor-muted)]">{budget.projects?.[0]?.name || "No project allocation"} · {budget.finance_categories?.[0]?.name || "No category"}</p></div><div className="flex items-center gap-4"><div className="text-right"><p className="text-sm font-semibold text-[var(--betanor-navy)]">{formatEtb(budget.planned_amount)}</p><p className="text-[10px] text-[var(--betanor-muted)]">{spent ? `${formatEtb(spent)} matched spend` : "No matched spend"}</p></div>{budget.status === "draft" ? <form action={approveBudget.bind(null, budget.id)}><Button size="sm" type="submit">Approve</Button></form> : null}</div></div>; })}</div> : <p className="px-5 py-10 text-sm text-[var(--betanor-muted)]">No budget lines have been created.</p>}</Card>
  </>}</main>;
}

