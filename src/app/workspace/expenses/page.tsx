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

async function createExpense(data: FormData) {
  "use server";
  const workspaceId = String(data.get("workspaceId") ?? "");
  const amount = Number(data.get("amount") ?? 0);
  const description = String(data.get("description") ?? "").trim();
  const expenseDate = String(data.get("expenseDate") ?? "");
  if (!workspaceId || !description || !expenseDate || !Number.isFinite(amount) || amount <= 0) return;
  const supabase = await createClient();
  const { data: employee } = await supabase.from("employees").select("id,department_id").eq("profile_id", String(data.get("profileId") ?? "")).maybeSingle();
  const requestedBy = employee?.id ?? null;
  const { error } = await supabase.from("expenses").insert({
    workspace_id: workspaceId,
    expense_number: `BTNR-EXP-${new Date().getFullYear()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`,
    requested_by: requestedBy,
    department_id: employee?.department_id ?? (String(data.get("departmentId") ?? "") || null),
    project_id: String(data.get("projectId") ?? "") || null,
    category_id: String(data.get("categoryId") ?? "") || null,
    vendor_id: String(data.get("vendorId") ?? "") || null,
    expense_date: expenseDate,
    amount,
    currency_code: "ETB",
    description,
    receipt_path: String(data.get("receiptPath") ?? "").trim() || null,
    status: "submitted",
  });
  if (!error) revalidatePath("/workspace/expenses");
}

async function decideExpense(expenseId: string, decision: "approved" | "rejected") {
  "use server";
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  const { data: approver } = userId ? await supabase.from("employees").select("id").eq("profile_id", userId).maybeSingle() : { data: null };
  const { data: updated, error } = await supabase.from("expenses").update({ status: decision, updated_at: new Date().toISOString() }).eq("id", expenseId).in("status", ["submitted", "in_review"]).select("id,workspace_id").maybeSingle();
  if (!error && updated) {
    await supabase.from("expense_approvals").insert({ expense_id: expenseId, approver_id: approver?.id ?? null, decision, note: decision === "approved" ? "Approved in finance workspace." : "Returned for correction." });
    revalidatePath("/workspace/expenses");
    revalidatePath("/workspace/finance");
  }
}

export default async function ExpensesPage() {
  const supabase = await createClient();
  const { workspaceId, userId } = await resolveWorkspace(supabase);
  const [employeeResult, categoriesResult, projectsResult, vendorsResult, expensesResult] = workspaceId
    ? await Promise.all([
      userId ? supabase.from("employees").select("id,department_id,first_name,last_name,employee_number").eq("profile_id", userId).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("finance_categories").select("id,name,category_type").eq("workspace_id", workspaceId).eq("category_type", "expense").order("name"),
      supabase.from("projects").select("id,name,project_code").eq("workspace_id", workspaceId).order("name"),
      supabase.from("vendors").select("id,name").eq("workspace_id", workspaceId).order("name"),
      supabase.from("expenses").select("id,expense_number,amount,currency_code,expense_date,description,receipt_path,status,created_at,employees!expenses_requested_by_fkey(first_name,last_name,employee_number),projects(name,project_code),finance_categories(name),vendors(name),expense_approvals(decision,note,decided_at)").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(60),
    ])
    : [{ data: null }, { data: [] }, { data: [] }, { data: [] }, { data: [], error: null }];
  const expenses = expensesResult.data ?? [];
  const totalSubmitted = expenses.filter((expense) => expense.status === "submitted" || expense.status === "in_review").reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const totalApproved = expenses.filter((expense) => expense.status === "approved").reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);

  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Finance · expenses</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Requests with an accountable trail.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Capture the business purpose, ETB amount, project or vendor context, and receipt reference before a finance approver releases the cost.</p></div><Link href="/workspace/finance" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">← Finance overview</Link></div>{!workspaceId ? <Card className="mt-8 p-6">Finance access is required.</Card> : <>
    <div className="mt-8 grid gap-4 sm:grid-cols-3"><Card className="p-5"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">Awaiting review</p><p className="mt-2 text-2xl font-semibold text-[var(--betanor-navy)]">{formatEtb(totalSubmitted)}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Submitted or in review</p></Card><Card className="p-5"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">Approved this view</p><p className="mt-2 text-2xl font-semibold text-[var(--betanor-navy)]">{formatEtb(totalApproved)}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Approved operational spend</p></Card><Card className="p-5"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">Policy basis</p><p className="mt-2 text-2xl font-semibold text-[var(--betanor-navy)]">ETB</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Evidence kept with each request</p></Card></div>
    <Card className="mt-8 p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Submit an expense request</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">Use the exact supplier or receipt amount in Ethiopian birr. A receipt URL can point to a private Supabase Storage object once uploads are enabled.</p><form action={createExpense} className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3"><input type="hidden" name="workspaceId" value={workspaceId}/><input type="hidden" name="profileId" value={userId ?? ""}/><input type="hidden" name="departmentId" value={employeeResult.data?.department_id ?? ""}/><div><FieldLabel htmlFor="expense-date">Expense date</FieldLabel><Input id="expense-date" name="expenseDate" required type="date"/></div><div><FieldLabel htmlFor="expense-amount">Amount (ETB)</FieldLabel><Input id="expense-amount" min="0.01" name="amount" required step="0.01" type="number"/></div><div><FieldLabel htmlFor="expense-category">Cost category</FieldLabel><select id="expense-category" name="categoryId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Category to be assigned</option>{categoriesResult.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div><FieldLabel htmlFor="expense-project">Project allocation</FieldLabel><select id="expense-project" name="projectId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No project allocation</option>{projectsResult.data?.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.project_code}</option>)}</select></div><div><FieldLabel htmlFor="expense-vendor">Supplier / vendor</FieldLabel><select id="expense-vendor" name="vendorId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No supplier selected</option>{vendorsResult.data?.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></div><div><FieldLabel htmlFor="expense-receipt">Receipt reference</FieldLabel><Input id="expense-receipt" name="receiptPath" type="url"/></div><div className="md:col-span-2 lg:col-span-3"><FieldLabel htmlFor="expense-description">Business purpose</FieldLabel><textarea id="expense-description" name="description" required rows={3} className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm"/></div><div className="lg:col-span-3"><Button type="submit">Submit for finance review</Button></div></form></Card>
    <Card className="mt-8 overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--betanor-border)] px-5 py-4"><div><h2 className="font-semibold text-[var(--betanor-navy)]">Expense queue</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">{expenses.length} request{expenses.length === 1 ? "" : "s"} visible to this role.</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold tracking-wide text-[var(--betanor-blue)]">ETB</span></div>{expenses.length ? <div className="divide-y divide-[var(--betanor-border)]">{expenses.map((expense) => { const latest = expense.expense_approvals?.[expense.expense_approvals.length - 1]; return <div key={expense.id} className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[var(--betanor-navy)]">{expense.description}</p><Badge tone={financeTone(expense.status)}>{titleCase(expense.status)}</Badge></div><p className="mt-1 text-xs text-[var(--betanor-muted)]">{expense.expense_number} · {expense.expense_date} · {expense.employees?.[0] ? `${expense.employees[0].first_name} ${expense.employees[0].last_name}` : "Finance staff"}</p><p className="mt-2 text-xs text-[var(--betanor-muted)]">{expense.finance_categories?.[0]?.name || "Uncategorised"}{expense.projects?.[0]?.name ? ` · ${expense.projects[0].name}` : ""}{expense.vendors?.[0]?.name ? ` · ${expense.vendors[0].name}` : ""}{expense.receipt_path ? " · Receipt linked" : " · Receipt pending"}</p>{latest?.note ? <p className="mt-2 text-xs text-[var(--betanor-muted)]">Latest review: {latest.note}</p> : null}</div><div className="flex shrink-0 items-center gap-3"><p className="text-lg font-semibold text-[var(--betanor-navy)]">{formatEtb(expense.amount)}</p>{expense.status === "submitted" || expense.status === "in_review" ? <><form action={decideExpense.bind(null, expense.id, "approved")}><Button size="sm" type="submit">Approve</Button></form><form action={decideExpense.bind(null, expense.id, "rejected")}><Button size="sm" type="submit" variant="outline">Return</Button></form></> : null}</div></div>; })}</div> : <p className="px-5 py-10 text-sm text-[var(--betanor-muted)]">No expense requests have been submitted.</p>}</Card>
  </>}</main>;
}
