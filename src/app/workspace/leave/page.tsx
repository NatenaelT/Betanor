import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function workdays(start: string, end: string) {
  const from = new Date(`${start}T00:00:00`); const to = new Date(`${end}T00:00:00`); let days = 0;
  for (const date = new Date(from); date <= to; date.setDate(date.getDate() + 1)) if (date.getDay() > 0 && date.getDay() < 6) days += 1;
  return days;
}
function tone(status: string) { return status === "approved" ? "success" as const : status === "rejected" ? "danger" as const : status === "in_review" ? "info" as const : "draft" as const; }

async function requestLeave(data: FormData) {
  "use server";
  const startsOn = String(data.get("startsOn") ?? ""); const endsOn = String(data.get("endsOn") ?? ""); const leaveTypeId = String(data.get("leaveTypeId") ?? ""); const duration = workdays(startsOn, endsOn); if (!startsOn || !endsOn || !leaveTypeId || duration < 1) return;
  const supabase = await createClient(); const { data: claims } = await supabase.auth.getClaims(); const userId = claims?.claims.sub; if (!userId) return;
  const { data: employee } = await supabase.from("employees").select("id").eq("profile_id", userId).maybeSingle(); if (!employee?.id) return;
  await supabase.from("leave_requests").insert({ employee_id: employee.id, leave_type_id: leaveTypeId, starts_on: startsOn, ends_on: endsOn, duration_days: duration, reason: String(data.get("reason") ?? "").trim() || null, status: "submitted" });
  revalidatePath("/workspace/leave");
}

async function decideLeave(data: FormData) {
  "use server";
  const requestId = String(data.get("requestId") ?? ""); const decision = String(data.get("decision") ?? ""); if (!requestId || !decision) return;
  const supabase = await createClient(); const { data: claims } = await supabase.auth.getClaims(); const userId = claims?.claims.sub; if (!userId) return;
  const { data: actor } = await supabase.from("employees").select("id").eq("profile_id", userId).maybeSingle(); if (!actor?.id) return;
  const { data: request } = await supabase.from("leave_requests").select("id,status,manager_approved_at,employees(manager_id)").eq("id", requestId).maybeSingle(); if (!request) return;
  const targetEmployee = request.employees?.[0];
  if (decision === "manager" && targetEmployee?.manager_id === actor.id && ["submitted", "in_review"].includes(request.status)) {
    await supabase.from("leave_requests").update({ status: "in_review", manager_approved_by: actor.id, manager_approved_at: new Date().toISOString(), approval_note: String(data.get("note") ?? "").trim() || null }).eq("id", requestId);
  }
  if (decision === "hr" && request.manager_approved_at) {
    await supabase.from("leave_requests").update({ status: String(data.get("outcome") ?? "approved") === "rejected" ? "rejected" : "approved", hr_approved_by: actor.id, hr_approved_at: new Date().toISOString(), approver_id: actor.id, decided_at: new Date().toISOString(), approval_note: String(data.get("note") ?? "").trim() || null }).eq("id", requestId);
  }
  revalidatePath("/workspace/leave");
}

function DecisionActions({ requestId, manager, hr }: { requestId: string; manager: boolean; hr: boolean }) {
  return <div className="w-full max-w-xs space-y-2">
    {manager ? <form action={decideLeave} className="space-y-2"><input type="hidden" name="requestId" value={requestId}/><textarea name="note" rows={2} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs" placeholder="Decision note"/><Button type="submit" name="decision" value="manager" size="sm" className="w-full">Approve as immediate manager</Button></form> : null}
    {hr ? <><form action={decideLeave}><input type="hidden" name="requestId" value={requestId}/><input type="hidden" name="decision" value="hr"/><Button type="submit" size="sm" className="w-full">Approve as HR</Button></form><form action={decideLeave}><input type="hidden" name="requestId" value={requestId}/><input type="hidden" name="decision" value="hr"/><input type="hidden" name="outcome" value="rejected"/><Button type="submit" size="sm" variant="danger" className="w-full">Reject as HR</Button></form></> : null}
  </div>;
}

export default async function LeavePage() {
  const supabase = await createClient(); const { data: claims } = await supabase.auth.getClaims(); const userId = claims?.claims.sub;
  const { data: profile } = userId ? await supabase.from("profiles").select("workspace_id").eq("id", userId).maybeSingle() : { data: null };
  const [{ data: ownEmployee }, { data: leaveTypes }, { data: requests, error }, { data: assignments }] = await Promise.all([
    userId ? supabase.from("employees").select("id,first_name,last_name,employee_number").eq("profile_id", userId).maybeSingle() : Promise.resolve({ data: null }),
    profile?.workspace_id ? supabase.from("leave_types").select("id,name,is_paid,annual_allowance").eq("workspace_id", profile.workspace_id).order("name") : Promise.resolve({ data: [] as never[] }),
    supabase.from("leave_requests").select("id,employee_id,starts_on,ends_on,duration_days,reason,status,manager_approved_at,hr_approved_at,employees(id,first_name,last_name,employee_number,manager_id),leave_types(name,is_paid,annual_allowance)").order("created_at", { ascending: false }),
    userId ? supabase.from("user_roles").select("roles(code)").eq("user_id", userId) : Promise.resolve({ data: [] as never[] }),
  ]);
  const roleCodes = (assignments ?? []).map((x) => x.roles?.[0]?.code).filter(Boolean); const hrApprover = roleCodes.some((code) => ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"].includes(code));
  const approvedDays = (requests ?? []).filter((r) => r.employee_id === ownEmployee?.id && r.status === "approved").reduce((sum, r) => sum + Number(r.duration_days || 0), 0);
  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">People module</p><h1 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">Leave desk</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Leave is counted in Monday–Friday working days and follows the immediate-manager then HR approval path.</p></div><Link href="/workspace/employees" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Employee directory →</Link></div>{ownEmployee ? <div className="mt-6 grid gap-4 md:grid-cols-3"><Card className="p-5"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">Employee</p><p className="mt-2 font-semibold text-[var(--betanor-navy)]">{ownEmployee.first_name} {ownEmployee.last_name}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">{ownEmployee.employee_number}</p></Card><Card className="p-5"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">Approved leave used</p><p className="mt-2 text-2xl font-semibold text-[var(--betanor-navy)]">{approvedDays} days</p></Card><Card className="p-5"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">Standard workweek</p><p className="mt-2 font-semibold text-[var(--betanor-navy)]">Monday–Friday</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">8 hours/day · 40 hours/week</p></Card></div> : <Card className="mt-6 p-5 text-sm text-amber-900">This login is not linked to an employee profile yet. HR can link it from the Employee directory.</Card>}{ownEmployee ? <Card className="mt-8 p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Request leave</h2><form action={requestLeave} className="mt-5 grid gap-4 md:grid-cols-2"><div><FieldLabel htmlFor="leave-type">Leave type</FieldLabel><select id="leave-type" name="leaveTypeId" required className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Select leave type</option>{leaveTypes?.map((type) => <option key={type.id} value={type.id}>{type.name} · {type.is_paid ? "Paid" : "Unpaid"}{type.annual_allowance ? ` · ${type.annual_allowance} days/year` : ""}</option>)}</select></div><div><FieldLabel htmlFor="leave-start">First working day</FieldLabel><Input id="leave-start" name="startsOn" required type="date"/></div><div><FieldLabel htmlFor="leave-end">Last working day</FieldLabel><Input id="leave-end" name="endsOn" required type="date"/></div><div className="md:col-span-2"><FieldLabel htmlFor="leave-reason">Reason and handover notes</FieldLabel><textarea id="leave-reason" name="reason" required rows={3} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm"/></div><Button type="submit" className="w-fit">Submit leave request</Button></form></Card> : null}<section className="mt-10"><h2 className="text-xl font-semibold text-[var(--betanor-navy)]">{hrApprover ? "HR approval queue" : "Leave requests"}</h2>{error ? <Card className="mt-4 p-6 text-sm text-[var(--betanor-danger)]">Leave requests could not be loaded.</Card> : requests?.length ? <div className="mt-4 space-y-4">{requests.map((request) => { const employee = request.employees?.[0]; const type = request.leave_types?.[0]; const manager = employee?.manager_id === ownEmployee?.id && !request.manager_approved_at && ["submitted", "in_review"].includes(request.status); const hr = hrApprover && Boolean(request.manager_approved_at) && ["submitted", "in_review"].includes(request.status); return <Card key={request.id} className="p-5"><div className="flex flex-col justify-between gap-4 md:flex-row"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={tone(request.status)}>{request.status.replaceAll("_", " ")}</Badge><span className="text-xs text-[var(--betanor-muted)]">{type?.name || "Leave"} · {request.duration_days} working day{Number(request.duration_days) === 1 ? "" : "s"}</span></div><p className="mt-3 font-semibold text-[var(--betanor-navy)]">{employee ? `${employee.first_name} ${employee.last_name} · ${employee.employee_number}` : "Employee request"}</p><p className="mt-1 text-sm text-[var(--betanor-text)]">{request.starts_on} → {request.ends_on}</p>{request.reason ? <p className="mt-2 text-sm text-[var(--betanor-muted)]">{request.reason}</p> : null}<p className="mt-2 text-xs text-[var(--betanor-muted)]">Manager: {request.manager_approved_at ? "approved" : "pending"} · HR: {request.hr_approved_at ? "decided" : "pending"}</p></div>{manager || hr ? <DecisionActions requestId={request.id} manager={manager} hr={hr}/> : null}</div></Card>; })}</div> : <Card className="mt-4 p-8"><p className="font-semibold text-[var(--betanor-navy)]">No leave requests yet.</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">Submitted requests and approval decisions will appear here.</p></Card>}</section></main>;
}
