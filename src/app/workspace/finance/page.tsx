import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatEtb, financeTone, titleCase } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function Metric({ label, value, detail, href }: { label: string; value: string; detail: string; href: string }) {
  return <Link href={href} className="group rounded-xl border border-[var(--betanor-border)] bg-white p-5 shadow-[0_1px_2px_rgba(11,31,58,0.05)] transition hover:-translate-y-0.5 hover:border-[var(--betanor-blue)]"><p className="text-xs font-semibold tracking-[0.12em] text-[var(--betanor-muted)] uppercase">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight text-[var(--betanor-navy)]">{value}</p><p className="mt-2 text-xs text-[var(--betanor-muted)] group-hover:text-[var(--betanor-blue)]">{detail} →</p></Link>;
}

export default async function FinancePage() {
  const supabase = await createClient();
  const { workspaceId, workspace, permissions } = await resolveWorkspace(supabase);
  const [invoicesResult, paymentsResult, expensesResult, budgetsResult, settingsResult] = workspaceId
    ? await Promise.all([
      supabase.from("invoices").select("id,invoice_number,total_amount,status,issued_on,due_on,customers(name),projects(name)").eq("workspace_id", workspaceId).order("issued_on", { ascending: false }).limit(80),
      supabase.from("payments").select("invoice_id,amount,received_on,method").order("received_on", { ascending: false }).limit(150),
      supabase.from("expenses").select("id,expense_number,amount,status,expense_date,description,projects(name),finance_categories(name)").eq("workspace_id", workspaceId).order("expense_date", { ascending: false }).limit(80),
      supabase.from("budgets").select("id,fiscal_year,planned_amount,status,departments(name),projects(name),finance_categories(name)").eq("workspace_id", workspaceId).order("fiscal_year", { ascending: false }).limit(80),
      supabase.from("workspace_finance_settings").select("default_vat_rate,default_payment_terms_days,fiscal_year_start_month").eq("workspace_id", workspaceId).maybeSingle(),
    ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: null, error: null }];
  const invoices = invoicesResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const budgets = budgetsResult.data ?? [];
  const paidByInvoice = new Map<string, number>();
  payments.forEach((payment) => paidByInvoice.set(payment.invoice_id, (paidByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount ?? 0)));
  const invoiced = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount ?? 0), 0);
  const received = payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
  const approvedExpenses = expenses.filter((expense) => expense.status === "approved").reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const pendingExpenses = expenses.filter((expense) => ["submitted", "in_review"].includes(expense.status));
  const currentYear = new Date().getFullYear();
  const planned = budgets.filter((budget) => budget.fiscal_year === currentYear).reduce((sum, budget) => sum + Number(budget.planned_amount ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = invoices.filter((invoice) => invoice.due_on && invoice.due_on < today && Number(invoice.total_amount ?? 0) > (paidByInvoice.get(invoice.id) ?? 0));
  const financeError = [invoicesResult.error, paymentsResult.error, expensesResult.error, budgetsResult.error].find(Boolean);
  const financeSettings = settingsResult.data;

  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Finance module</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">A complete view of Betanor&apos;s money.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Track receivables, receipts, payables, expense approvals, budgets, and Ethiopian invoice evidence from one permission-scoped ledger.</p></div><div className="flex flex-wrap gap-2">{permissions.has("expense.request") || permissions.has("finance.create") ? <Link href="/workspace/expenses" className="rounded-lg bg-[var(--betanor-navy)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--betanor-blue)]">New expense</Link> : null}{permissions.has("finance.create") ? <Link href="/workspace/invoices" className="rounded-lg border border-[var(--betanor-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-blue)]">Create invoice</Link> : null}</div></div>
    {!workspaceId ? <Card className="mt-8 p-6"><h2 className="font-semibold text-[var(--betanor-navy)]">Finance access is required</h2><p className="mt-2 text-sm text-[var(--betanor-muted)]">Ask an administrator to assign finance access to your account.</p></Card> : <>
      {financeError ? <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Some finance records could not be loaded. The panels below show the records your role can access.</div> : null}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Invoiced" value={formatEtb(invoiced)} detail={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`} href="/workspace/invoices"/><Metric label="Received" value={formatEtb(received)} detail={`${invoiced > 0 ? Math.round((received / invoiced) * 100) : 0}% collected`} href="/workspace/invoices"/><Metric label="Outstanding" value={formatEtb(Math.max(invoiced - received, 0))} detail={`${overdue.length} overdue`} href="/workspace/invoices"/><Metric label="Approved expenses" value={formatEtb(approvedExpenses)} detail={`${pendingExpenses.length} awaiting review`} href="/workspace/expenses"/><Metric label={`${currentYear} budget`} value={formatEtb(planned)} detail={`${budgets.length} budget line${budgets.length === 1 ? "" : "s"}`} href="/workspace/budgets"/></div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_.75fr]"><Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--betanor-border)] px-5 py-4"><div><h2 className="font-semibold text-[var(--betanor-navy)]">Receivables and invoices</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">Outstanding and overdue balances linked to customers and projects.</p></div><Link href="/workspace/invoices" className="text-xs font-semibold text-[var(--betanor-blue)] hover:underline">Open ledger →</Link></div>{invoices.length ? <div className="divide-y divide-[var(--betanor-border)]">{invoices.slice(0, 8).map((invoice) => { const paid = paidByInvoice.get(invoice.id) ?? 0; const balance = Math.max(Number(invoice.total_amount ?? 0) - paid, 0); const isOverdue = Boolean(invoice.due_on && invoice.due_on < today && balance > 0); return <div key={invoice.id} className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[var(--betanor-navy)]">{invoice.invoice_number}</p>{isOverdue ? <Badge tone="warning">Overdue</Badge> : <Badge tone={financeTone(invoice.status)}>{titleCase(invoice.status)}</Badge>}</div><p className="mt-1 text-xs text-[var(--betanor-muted)]">{invoice.customers?.[0]?.name || "Customer pending"}{invoice.projects?.[0]?.name ? ` · ${invoice.projects[0].name}` : ""} · Due {invoice.due_on || "on receipt"}</p></div><div className="text-right"><p className="text-sm font-semibold text-[var(--betanor-navy)]">{formatEtb(balance)}</p><p className="text-[10px] text-[var(--betanor-muted)]">outstanding</p></div></div>; })}</div> : <p className="px-5 py-10 text-sm text-[var(--betanor-muted)]">No invoices have been created yet.</p>}</Card>
        <Card className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-[var(--betanor-navy)]">Control centre</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">Operational finance queues and current policy.</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold tracking-wide text-[var(--betanor-blue)]">{workspace?.currency_code || "ETB"}</span></div><div className="mt-5 space-y-3"><Link href="/workspace/expenses" className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-blue-50"><span>Expense approvals</span><span className="text-[var(--betanor-blue)]">{pendingExpenses.length}</span></Link><Link href="/workspace/budgets" className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-blue-50"><span>Budget variance</span><span className="text-[var(--betanor-blue)]">{formatEtb(Math.max(approvedExpenses - planned, 0))}</span></Link><Link href="/workspace/invoices" className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-blue-50"><span>Overdue invoices</span><span className="text-[var(--betanor-warning)]">{overdue.length}</span></Link></div><div className="mt-6 border-t border-[var(--betanor-border)] pt-5 text-xs leading-5 text-[var(--betanor-muted)]">Policy: VAT {financeSettings?.default_vat_rate ?? 15}% · payment terms {financeSettings?.default_payment_terms_days ?? 30} days · fiscal start month {financeSettings?.fiscal_year_start_month ?? 7}. Configure these in System configuration.</div></Card></div>
    </>}</main>;
}
