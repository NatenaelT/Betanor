import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatEtb } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";
type Tile = { label: string; value: string; detail: string; href: string; tone: "blue" | "gold" | "green" | "red" };

export default async function OverviewPage() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.workspaceId) return null;
  const [{ data: profile }, { data: roleAssignments }, { data: employee }] = await Promise.all([
    supabase.from("profiles").select("full_name,job_title").eq("id", access.userId).maybeSingle(),
    supabase.from("user_roles").select("roles(name)").eq("user_id", access.userId),
    supabase.from("employees").select("id").eq("profile_id", access.userId).eq("workspace_id", access.workspaceId).maybeSingle(),
  ]);
  const roles = (roleAssignments ?? []).map((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return role?.name;
  }).filter(Boolean) as string[];
  const primaryRole = roles[0] || profile?.job_title || "Betanor colleague";
  const permissions = access.permissions;
  const tiles: Tile[] = [];
  const reads: Promise<void>[] = [];

  reads.push((async () => {
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", access.userId as string).is("read_at", null);
    tiles.push({ label: "Unread updates", value: String(count ?? 0), detail: "Your notifications and assignments", href: "/workspace/noren/inbox", tone: "blue" });
  })());
  if (employee?.id) reads.push((async () => {
    const { count } = await supabase.from("task_assignees").select("task_id", { count: "exact", head: true }).eq("employee_id", employee.id);
    tiles.push({ label: "My assigned tasks", value: String(count ?? 0), detail: "Open your personal work queue", href: "/workspace/my-work", tone: "gold" });
  })());
  if (permissions.has("users.manage")) reads.push((async () => {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("workspace_id", access.workspaceId).eq("is_active", true);
    tiles.push({ label: "Active user accounts", value: String(count ?? 0), detail: "Staff and customer access", href: "/workspace/admin/users", tone: "blue" });
  })());
  if (permissions.has("hr.read") || permissions.has("hr.manage")) reads.push((async () => {
    const { count } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("workspace_id", access.workspaceId).eq("employment_status", "active");
    tiles.push({ label: "Active employees", value: String(count ?? 0), detail: "People directory", href: "/workspace/employees", tone: "green" });
  })());
  if (permissions.has("leave.approve")) reads.push((async () => {
    const { count } = await supabase.from("leave_requests").select("id", { count: "exact", head: true }).in("status", ["submitted", "in_review"]);
    tiles.push({ label: "Leave approvals", value: String(count ?? 0), detail: "Requests awaiting review", href: "/workspace/leave", tone: "gold" });
  })());
  if (permissions.has("payroll.manage")) reads.push((async () => {
    const { count } = await supabase.from("payroll_cycles").select("id", { count: "exact", head: true }).eq("workspace_id", access.workspaceId).eq("status", "draft");
    tiles.push({ label: "Draft payroll cycles", value: String(count ?? 0), detail: "Review and publish payslips", href: "/workspace/payslips", tone: "gold" });
  })());
  if (permissions.has("finance.read")) reads.push((async () => {
    const { data } = await supabase.from("invoices").select("total_amount").eq("workspace_id", access.workspaceId).limit(100);
    const total = (data ?? []).reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    tiles.push({ label: "Invoice book", value: formatEtb(total), detail: `${data?.length ?? 0} recent receivables`, href: "/workspace/finance", tone: "blue" });
  })());
  if (permissions.has("crm.read") || permissions.has("crm.write")) reads.push((async () => {
    const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", access.workspaceId);
    tiles.push({ label: "Sales leads", value: String(count ?? 0), detail: "Commercial pipeline", href: "/workspace/crm", tone: "blue" });
  })());
  if (permissions.has("tender.read") || permissions.has("tender.view_all")) reads.push((async () => {
    const { count } = await supabase.from("tenders").select("id", { count: "exact", head: true }).eq("workspace_id", access.workspaceId).not("status", "in", "(SUBMITTED,AWARDED,LOST,CANCELLED)");
    tiles.push({ label: "Active tenders", value: String(count ?? 0), detail: "Deadlines, requirements, and submissions", href: "/workspace/tenders", tone: "gold" });
  })());
  if (permissions.has("support.read") || permissions.has("support.view_all")) reads.push((async () => {
    const { count } = await supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("workspace_id", access.workspaceId).not("status", "in", '("Resolved","Closed","Cancelled")');
    tiles.push({ label: "Open support tickets", value: String(count ?? 0), detail: "Customer requests needing attention", href: "/workspace/support/tickets", tone: "red" });
  })());
  if (permissions.has("project.manage")) reads.push((async () => {
    const { count } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", access.workspaceId).not("status", "in", "(completed,cancelled)");
    tiles.push({ label: "Live projects", value: String(count ?? 0), detail: "Delivery portfolio", href: "/workspace/projects", tone: "green" });
  })());

  await Promise.all(reads);
  tiles.sort((a, b) => a.label.localeCompare(b.label));
  const name = profile?.full_name || "Betanor colleague";
  const description = access.roleCodes.has("SUPER_ADMIN")
    ? "Your management overview brings together the access, delivery, and business signals available to you."
    : `This ${primaryRole.toLowerCase()} overview highlights work and decisions available to your role.`;

  return <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.15em] text-[var(--betanor-blue)]">Personal overview</p><h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-[var(--betanor-navy)] sm:text-3xl">Welcome, {name}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">{description}</p></div>
      <div className="flex flex-wrap gap-2"><Badge tone="info">{primaryRole}</Badge>{access.workspace ? <Badge tone="neutral">{access.workspace.name}</Badge> : null}<Link href="/workspace" className="inline-flex min-h-9 items-center rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-xs font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-blue)]">All modules</Link></div>
    </div>
    {tiles.length ? <section aria-label="Role-specific analytics" className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tiles.map((tile) => <Link key={tile.label} href={tile.href} className="group min-w-0"><Card className="h-full p-4 transition hover:-translate-y-0.5 hover:border-[var(--betanor-blue)] sm:p-5"><div className="flex items-center justify-between gap-3"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[var(--betanor-muted)]">{tile.label}</p><span className={`size-2 rounded-full ${tile.tone === "gold" ? "bg-[var(--betanor-gold)]" : tile.tone === "green" ? "bg-emerald-500" : tile.tone === "red" ? "bg-rose-500" : "bg-blue-500"}`} /></div><p className="mt-3 text-2xl font-semibold tracking-tight text-[var(--betanor-navy)]">{tile.value}</p><p className="mt-2 text-xs text-[var(--betanor-muted)] group-hover:text-[var(--betanor-blue)]">{tile.detail} →</p></Card></Link>)}</section> : <Card className="mt-7 p-5 text-sm text-[var(--betanor-muted)]">No analytics are assigned to this role yet. Use the module directory to open your available work areas.</Card>}
    <div className="mt-7 grid gap-4 lg:grid-cols-2"><Card className="p-5"><h2 className="font-semibold text-[var(--betanor-navy)]">Your priorities</h2><p className="mt-1 text-sm leading-6 text-[var(--betanor-muted)]">Start with assigned work and notifications; records remain scoped by your role and workspace permissions.</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/workspace/my-work" className="inline-flex min-h-9 items-center rounded-lg bg-[var(--betanor-navy)] px-3 text-xs font-semibold text-white hover:bg-[var(--betanor-blue)]">My work</Link><Link href="/workspace/noren/inbox" className="inline-flex min-h-9 items-center rounded-lg border border-[var(--betanor-border)] px-3 text-xs font-semibold text-[var(--betanor-navy)] hover:bg-slate-50">Notifications</Link></div></Card><Card className="border-[color-mix(in_srgb,var(--betanor-gold)_40%,white)] bg-[color-mix(in_srgb,var(--betanor-gold)_9%,white)] p-5"><h2 className="font-semibold text-[var(--betanor-navy)]">Need another area?</h2><p className="mt-1 text-sm leading-6 text-[var(--betanor-muted)]">Your module directory lists every area this account can open.</p><Link href="/workspace" className="mt-4 inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-xs font-semibold text-[var(--betanor-navy)] shadow-sm hover:text-[var(--betanor-blue)]">Browse my modules →</Link></Card></div>
  </main>;
}
