import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";
import { SupportRealtimeBridge } from "@/components/support/support-realtime-bridge";

// Support relations are introduced by the feature migration and are not yet in
// the checked-in generated Supabase type snapshot.
/* eslint-disable @typescript-eslint/no-explicit-any */

const modules = [
  ["Customers", "Customer accounts and service contacts", "customers"], ["Support contracts", "Coverage, scope and service levels", "contracts"],
  ["Support tickets", "Diagnose, assign and resolve customer requests", "tickets"], ["Remote support", "Remote and video service sessions", "remote"],
  ["On-site support", "Visit plan and technician work logs", "onsite"], ["Asset management", "Customer devices and lifecycle", "assets"],
  ["Onboarding / offboarding", "Provisioning and return checklists", "lifecycle"], ["Schedule / calendar", "RTSL Thursday visits and appointments", "calendar"],
  ["Tasks", "Linked support delivery tasks", "tasks"], ["Documents", "Customer support documents", "documents"],
  ["SLA tracking", "Response and resolution commitments", "sla"], ["Activity history", "Ticket event and service history", "activity"], ["Reports", "Workload, response and SLA overview", "reports"],
] as const;

export default async function SupportDashboard() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  const allowed = access.permissions.has("support.read") || access.permissions.has("support.create") || access.permissions.has("support.view_all") || access.permissions.has("support.manage_contracts");
  if (!access.workspaceId || !allowed) redirect("/workspace");
  const db = supabase as any;
  const { data: employee } = await db.from("employees").select("id,first_name,last_name").eq("profile_id", access.userId).eq("workspace_id", access.workspaceId).maybeSingle();
  const q = () => { let query = db.from("support_tickets").select("id,status,priority,resolution_due_at").eq("workspace_id", access.workspaceId); if (!access.permissions.has("support.view_all") && employee?.id) query = query.eq("assigned_employee_id", employee.id); return query.limit(100); };
  const [{ data: tickets }, { count: assetCount }, { count: visitCount }] = await Promise.all([
    q(), db.from("support_assets").select("id", { count: "exact", head: true }).eq("workspace_id", access.workspaceId),
    db.from("support_schedule_entries").select("id", { count: "exact", head: true }).eq("workspace_id", access.workspaceId),
  ]);
  const rows = tickets ?? [];
  const cards = [["Open tickets", rows.filter((x: any) => !["Resolved", "Closed", "Cancelled"].includes(x.status)).length], ["Critical", rows.filter((x: any) => x.priority === "critical").length], ["Tickets with SLA", rows.filter((x: any) => Boolean(x.resolution_due_at) && !["Resolved", "Closed"].includes(x.status)).length], ["Assigned assets", assetCount ?? 0], ["Scheduled support", visitCount ?? 0]];
  const visibleModules = modules.filter(([, , key]) => access.permissions.has("support.view_all") || access.permissions.has("support.read") || ["tickets", "remote"].includes(key) && access.permissions.has("support.respond") || key === "reports" && access.permissions.has("support.view_reports"));
  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10"><SupportRealtimeBridge workspaceId={access.workspaceId}/><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold tracking-[.14em] text-[var(--betanor-blue)] uppercase">IT Support / Managed Support</p><h1 className="mt-2 text-3xl font-semibold text-[var(--betanor-navy)]">{employee ? `Welcome, ${employee.first_name}` : "Support operations"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">{access.permissions.has("support.view_all") ? "Service desk overview across assigned customer engagements." : "A focused view of tickets and actions assigned to you."} RTSL onsite service is scheduled Thursdays, 9:00 AM–12:00 PM (Addis Ababa).</p></div><Link href="/portal/support" className="rounded-lg border border-[var(--betanor-border)] px-4 py-2 text-sm font-semibold text-[var(--betanor-navy)]">Customer support view ↗</Link></div>
  <div className="mt-7 grid gap-3 grid-cols-2 lg:grid-cols-5">{cards.map(([label,value])=><Card key={label} className="p-4"><p className="text-xs text-[var(--betanor-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold text-[var(--betanor-navy)]">{value}</p></Card>)}</div>
  <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleModules.map(([title,description,key])=><Link key={key} href={`/workspace/support/${key}`} className="group"><Card className="h-full p-5 transition hover:border-[var(--betanor-blue)] hover:shadow-md"><p className="font-semibold text-[var(--betanor-navy)] group-hover:text-[var(--betanor-blue)]">{title} →</p><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">{description}</p></Card></Link>)}</div>
  <Card className="mt-8 p-5"><p className="font-semibold text-[var(--betanor-navy)]">RTSL managed service scope</p><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">Remote and onsite support · Windows/Mac deployment · hardware/software troubleshooting · networking · video conferencing · telephony · asset lifecycle · workstation and security configuration · updates · software installation · remote access · endpoint protection · staff onboarding/offboarding.</p></Card></main>;
}
