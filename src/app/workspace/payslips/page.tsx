import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { formatEtb, financeTone, titleCase } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";
function value(data: FormData, key: string) { return String(data.get(key) ?? "").trim(); }

async function generatePayroll(data: FormData) {
  "use server";
  const periodStart = value(data, "periodStart"); const periodEnd = value(data, "periodEnd");
  if (!periodStart || !periodEnd || periodEnd < periodStart) return;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.permissions.has("payroll.manage")) return;
  const { data: existingCycle } = await supabase.from("payroll_cycles").select("id,status").eq("workspace_id", access.workspaceId).eq("period_start", periodStart).eq("period_end", periodEnd).maybeSingle();
  if (existingCycle && ["approved", "cancelled"].includes(existingCycle.status)) return;
  const { data: cycle, error } = existingCycle
    ? { data: existingCycle, error: null }
    : await supabase.from("payroll_cycles").insert({ workspace_id: access.workspaceId, period_start: periodStart, period_end: periodEnd, status: "draft" }).select("id,status").single();
  if (error || !cycle) return;
  const { data: employees } = await supabase.from("employees").select("id,employment_status,employment_contracts(salary_amount,currency_code,status,starts_on,ends_on)").eq("workspace_id", access.workspaceId);
  for (const employee of employees ?? []) {
    if (employee.employment_status !== "active") continue;
    const contracts = Array.isArray(employee.employment_contracts) ? employee.employment_contracts : [];
    const contract = [...contracts].filter((item) => Number(item.salary_amount ?? 0) > 0 && String(item.starts_on) <= periodEnd && (!item.ends_on || String(item.ends_on) >= periodStart)).sort((a, b) => String(b.starts_on).localeCompare(String(a.starts_on)))[0];
    if (!contract) continue;
    const gross = Number(contract.salary_amount ?? 0);
    await supabase.from("payslips").upsert({ payroll_cycle_id: cycle.id, employee_id: employee.id, gross_pay: gross, deductions: 0, net_pay: gross, currency_code: contract.currency_code || "ETB", status: "draft" }, { onConflict: "payroll_cycle_id,employee_id" });
  }
  revalidatePath("/workspace/payslips");
}

async function finalizePayroll(data: FormData) {
  "use server";
  const cycleId = value(data, "cycleId"); if (!cycleId) return;
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("payroll.manage")) return;
  const { data: cycle } = await supabase.from("payroll_cycles").select("id,status").eq("id", cycleId).maybeSingle();
  if (!cycle || ["approved", "cancelled"].includes(cycle.status)) return;
  await supabase.from("payslips").update({ status: "approved" }).eq("payroll_cycle_id", cycleId);
  await supabase.from("payroll_cycles").update({ status: "approved", processed_at: new Date().toISOString() }).eq("id", cycleId);
  revalidatePath("/workspace/payslips");
}

export default async function PayslipsPage() {
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("payroll.read_self") && !access.permissions.has("payroll.manage")) redirect("/workspace");
  const canManage = access.permissions.has("payroll.manage");
  const [cyclesResult, slipsResult, employeeResult] = await Promise.all([
    canManage && access.workspaceId ? supabase.from("payroll_cycles").select("id,period_start,period_end,status,processed_at,payslips(id,employee_id,gross_pay,deductions,net_pay,currency_code,status,employees(first_name,last_name,employee_number))").eq("workspace_id", access.workspaceId).order("period_start", { ascending: false }).limit(12) : Promise.resolve({ data: [] as never[] }),
    supabase.from("payslips").select("id,gross_pay,deductions,net_pay,currency_code,status,payroll_cycles(period_start,period_end)").order("created_at", { ascending: false }).limit(30),
    access.userId ? supabase.from("employees").select("id,employee_number,first_name,last_name").eq("profile_id", access.userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const today = new Date(); const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10); const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const ownSlips = slipsResult.data ?? [];
  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">People & finance</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Payroll & payslips</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Generate a controlled monthly baseline from active employment contracts, then approve the cycle before employees see the finalized slip.</p></div><Badge tone={canManage ? "info" : "success"}>{canManage ? "Payroll manager" : "Self service"}</Badge></div>
    {canManage ? <Card className="mt-8 p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Generate payroll cycle</h2><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">The baseline uses each active employee&apos;s current ETB employment contract. Deductions are intentionally zero until approved Ethiopian tax, pension, benefit, and attendance rules are configured.</p><form action={generatePayroll} className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"><div><FieldLabel htmlFor="payroll-start">Period start</FieldLabel><Input id="payroll-start" name="periodStart" type="date" defaultValue={firstOfMonth} required /></div><div><FieldLabel htmlFor="payroll-end">Period end</FieldLabel><Input id="payroll-end" name="periodEnd" type="date" defaultValue={lastOfMonth} required /></div><Button type="submit">Generate draft slips</Button></form></Card> : null}
    {canManage ? <Card className="mt-8 overflow-hidden"><div className="border-b border-[var(--betanor-border)] px-5 py-4"><h2 className="font-semibold text-[var(--betanor-navy)]">Payroll cycles</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">Review totals before publishing payslips to staff portals.</p></div><div className="divide-y divide-[var(--betanor-border)]">{(cyclesResult.data ?? []).length ? (cyclesResult.data ?? []).map((cycle) => { const slips = cycle.payslips ?? []; const total = slips.reduce((sum, slip) => sum + Number(slip.net_pay ?? 0), 0); return <div key={cycle.id} className="px-5 py-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-[var(--betanor-navy)]">{cycle.period_start} → {cycle.period_end}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">{slips.length} slips · net {formatEtb(total)}</p></div><div className="flex items-center gap-3"><Badge tone={financeTone(cycle.status)}>{titleCase(cycle.status)}</Badge>{cycle.status !== "approved" ? <form action={finalizePayroll}><input type="hidden" name="cycleId" value={cycle.id}/><Button type="submit" size="sm">Approve & publish</Button></form> : null}</div></div>{slips.length ? <div className="mt-4 grid gap-2 text-xs text-[var(--betanor-muted)] sm:grid-cols-2 lg:grid-cols-3">{slips.slice(0, 6).map((slip) => <div key={slip.id} className="rounded-lg bg-slate-50 px-3 py-2"><span className="font-semibold text-[var(--betanor-navy)]">{slip.employees?.[0]?.first_name} {slip.employees?.[0]?.last_name}</span><span className="ml-2">{formatEtb(Number(slip.net_pay ?? 0))}</span></div>)}</div> : <p className="mt-3 text-xs text-[var(--betanor-muted)]">No active employees with a salary contract were found.</p>}</div>; }) : <p className="px-5 py-10 text-sm text-[var(--betanor-muted)]">No payroll cycles yet.</p>}</div></Card> : null}
    <Card className="mt-8 overflow-hidden"><div className="border-b border-[var(--betanor-border)] px-5 py-4"><h2 className="font-semibold text-[var(--betanor-navy)]">{canManage ? "Employee payslip access" : "My payslips"}</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">{employeeResult.data ? `Employee ${employeeResult.data.employee_number}` : "Your approved salary records"}</p></div>{ownSlips.length ? <div className="divide-y divide-[var(--betanor-border)]">{ownSlips.map((slip) => { const cycle = Array.isArray(slip.payroll_cycles) ? slip.payroll_cycles[0] : slip.payroll_cycles; return <div key={slip.id} className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-[var(--betanor-navy)]">{cycle?.period_start || "Period"} → {cycle?.period_end || ""}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Gross {formatEtb(Number(slip.gross_pay ?? 0))} · Deductions {formatEtb(Number(slip.deductions ?? 0))}</p></div><div className="flex items-center gap-4"><span className="text-sm font-semibold text-[var(--betanor-navy)]">{formatEtb(Number(slip.net_pay ?? 0))}</span><Badge tone={financeTone(slip.status)}>{titleCase(slip.status)}</Badge></div></div>; })}</div> : <p className="px-5 py-10 text-sm text-[var(--betanor-muted)]">No payslips are available yet. Approved cycles will appear here.</p>}</Card>
    <Card className="mt-6 border-amber-100 bg-amber-50/50 p-5"><p className="text-sm font-semibold text-amber-950">Payroll control note</p><p className="mt-2 text-sm leading-6 text-amber-900">This workflow calculates the contractual gross-to-net baseline and records an approval trail. Before using it for Ethiopian payroll filing, configure current tax brackets, pension contributions, benefits, attendance, and statutory reporting with Finance and HR.</p></Card>
  </main>;
}
