import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";
type ModuleCard = { label: string; description: string; href: string; permissions?: string[]; staffOnly?: boolean };

const moduleArt: Record<string, { icon: string; background: string; iconBackground: string; iconColor: string; glow: string }> = {
  "My work": { icon: "work", background: "from-sky-50 via-white to-blue-100/80", iconBackground: "bg-sky-100", iconColor: "text-sky-800", glow: "bg-sky-300/40" },
  "Messages & chat": { icon: "chat", background: "from-violet-50 via-white to-fuchsia-100/70", iconBackground: "bg-violet-100", iconColor: "text-violet-800", glow: "bg-fuchsia-300/40" },
  People: { icon: "people", background: "from-rose-50 via-white to-orange-100/70", iconBackground: "bg-rose-100", iconColor: "text-rose-800", glow: "bg-orange-300/40" },
  "IT Support": { icon: "support", background: "from-teal-50 via-white to-cyan-100/80", iconBackground: "bg-teal-100", iconColor: "text-teal-800", glow: "bg-cyan-300/40" },
  Finance: { icon: "finance", background: "from-emerald-50 via-white to-lime-100/70", iconBackground: "bg-emerald-100", iconColor: "text-emerald-800", glow: "bg-lime-300/40" },
  "Sales & clients": { icon: "sales", background: "from-amber-50 via-white to-yellow-100/80", iconBackground: "bg-amber-100", iconColor: "text-amber-900", glow: "bg-yellow-300/50" },
  Tenders: { icon: "tender", background: "from-indigo-50 via-white to-blue-100/80", iconBackground: "bg-indigo-100", iconColor: "text-indigo-800", glow: "bg-blue-300/40" },
  "Documents & letters": { icon: "document", background: "from-slate-100 via-white to-sky-100/80", iconBackground: "bg-slate-200", iconColor: "text-slate-800", glow: "bg-sky-300/40" },
  Mailbox: { icon: "mail", background: "from-cyan-50 via-white to-blue-100/80", iconBackground: "bg-cyan-100", iconColor: "text-cyan-800", glow: "bg-blue-300/40" },
  "System & content": { icon: "system", background: "from-orange-50 via-white to-amber-100/70", iconBackground: "bg-orange-100", iconColor: "text-orange-800", glow: "bg-amber-300/40" },
  "Users & departments": { icon: "admin", background: "from-blue-50 via-white to-indigo-100/80", iconBackground: "bg-blue-100", iconColor: "text-blue-900", glow: "bg-indigo-300/40" },
  "Help & user manual": { icon: "help", background: "from-pink-50 via-white to-rose-100/70", iconBackground: "bg-pink-100", iconColor: "text-pink-800", glow: "bg-rose-300/40" },
};

function ModuleIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" {...common}>
    {name === "work" ? <><path d="M9 5h6l1 2h3v13H5V7h3l1-2Z"/><path d="m9 13 2 2 4-4"/></> : null}
    {name === "chat" ? <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8 8 0 0 1-3.5-.8L4 20l1.3-3.5A7.2 7.2 0 0 1 4 12c0-4.1 3.6-7.5 8-7.5s8 3.1 8 7Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></> : null}
    {name === "people" ? <><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.2a5.5 5.5 0 0 1 11 0V19M16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4V19"/></> : null}
    {name === "support" ? <><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><path d="M4 13h3v6H6a2 2 0 0 1-2-2v-4ZM20 13h-3v6h1a2 2 0 0 0 2-2v-4ZM17 20a5 5 0 0 1-5 2"/></> : null}
    {name === "finance" ? <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/><path d="M16 6h4v4"/></> : null}
    {name === "sales" ? <><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 12h16M10 12v2h4v-2"/></> : null}
    {name === "tender" ? <><path d="M7 4h10l3 3v13H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M17 4v4h4M9 12h6M9 16h6"/></> : null}
    {name === "document" ? <><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v6h5M9 13h6M9 17h6"/></> : null}
    {name === "mail" ? <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></> : null}
    {name === "system" ? <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="white"/><circle cx="15" cy="12" r="2" fill="white"/><circle cx="8" cy="18" r="2" fill="white"/></> : null}
    {name === "admin" ? <><path d="M12 3 20 6v5c0 5-3.5 8.3-8 10-4.5-1.7-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/></> : null}
    {name === "help" ? <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 4.4 1.3c-.9 1.2-2.1 1.4-2.1 3M12 17h.01"/></> : null}
  </svg>;
}

export default async function WorkspaceModulesPage() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId) return null;
  const [{ data: profile }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", access.userId).maybeSingle(),
    supabase.from("user_roles").select("roles(name)").eq("user_id", access.userId),
  ]);
  const roleNames = (assignments ?? []).map((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return role?.name;
  }).filter(Boolean) as string[];
  const permissions = access.permissions;
  const cards: ModuleCard[] = [
    { label: "My work", description: "Assigned tasks, projects, due dates, and delivery updates.", href: permissions.has("project.manage") ? "/workspace/projects" : permissions.has("task.create") || permissions.has("task.assign") || permissions.has("task.edit") ? "/workspace/tasks" : "/workspace/my-work", permissions: ["project.manage", "task.create", "task.assign", "task.edit"], staffOnly: true },
    { label: "Messages & chat", description: "Staff discussions, customer conversations, and your notification inbox.", href: permissions.has("chat.manage") || permissions.has("chat.internal.read") ? "/workspace/chats" : "/workspace/noren/inbox", permissions: ["chat.manage", "chat.internal.read"] },
    { label: "People", description: "Employee records, leave approvals, recruitment, payroll, and KPIs.", href: permissions.has("hr.read") || permissions.has("hr.manage") ? "/workspace/employees" : permissions.has("leave.request") || permissions.has("leave.approve") ? "/workspace/leave" : permissions.has("recruitment.manage") ? "/workspace/recruitment" : permissions.has("payroll.manage") || permissions.has("payroll.read_self") ? "/workspace/payslips" : "/workspace/kpis", permissions: ["hr.read", "hr.manage", "leave.request", "leave.approve", "recruitment.manage", "payroll.read_self", "payroll.manage", "kpi.read_self", "kpi.read_team", "kpi.configure", "kpi.review"] },
    { label: "IT Support", description: "Customer support tickets, onsite visits, remote sessions, and SLA work.", href: "/workspace/support", permissions: ["support.read", "support.create", "support.view_all", "support.manage_contracts"] },
    { label: "Finance", description: "Financial operations, approvals, expenses, budgets, invoices, and payslips.", href: permissions.has("finance.read") || permissions.has("finance.create") || permissions.has("finance.approve") ? "/workspace/finance" : "/workspace/expenses", permissions: ["finance.read", "finance.create", "finance.approve", "expense.request"] },
    { label: "Sales & clients", description: "CRM, customer requests, quotations, and contracts available to your role.", href: permissions.has("crm.read") || permissions.has("crm.write") ? "/workspace/crm" : permissions.has("rfq.read") || permissions.has("rfq.write") ? "/workspace/rfqs" : permissions.has("quotation.create") || permissions.has("quotation.edit") || permissions.has("quotation.approve") || permissions.has("quotation.send") ? "/workspace/quotations" : permissions.has("contract.create") || permissions.has("contract.approve") ? "/workspace/contracts" : "/workspace/crm", permissions: ["crm.read", "crm.write", "rfq.read", "rfq.write", "quotation.create", "quotation.edit", "quotation.approve", "quotation.send", "contract.create", "contract.approve"] },
    { label: "Tenders", description: "Track opportunities, requirements, bid securities, and final submissions.", href: "/workspace/tenders", permissions: ["tender.read", "tender.create", "tender.view_all", "tender.manage_guarantees"] },
    { label: "Documents & letters", description: "Secure workspace files and official Betanor correspondence.", href: permissions.has("letters.read") || permissions.has("letters.create") || permissions.has("letters.view_department") || permissions.has("letters.view_all") ? "/workspace/letters" : "/workspace/documents", permissions: ["files.manage", "letters.read", "letters.create", "letters.edit_own", "letters.edit_all", "letters.view_department", "letters.view_all"] },
    { label: "Mailbox", description: "Your registered Betanor mailbox, signatures, and email correspondence.", href: "/workspace/mailbox", permissions: ["email.read", "email.read_all", "email.send", "email.manage"] },
    { label: "System & content", description: "Manage the customer-facing site, catalogue, configuration, and brand settings.", href: permissions.has("settings.manage") ? "/workspace/admin/settings" : permissions.has("cms.read") || permissions.has("cms.write") || permissions.has("cms.publish") ? "/workspace/cms" : "/workspace/products", permissions: ["settings.manage", "cms.read", "cms.write", "cms.publish", "style.manage"] },
    { label: "Users & departments", description: "Administer user access, permissions, departments, and positions.", href: permissions.has("users.manage") ? "/workspace/admin/users" : "/workspace/admin/departments", permissions: ["users.manage", "hr.manage"] },
    { label: "Help & user manual", description: "Read role-based how-to guides, help articles, and FAQs.", href: "/workspace/help" },
  ];
  const visibleCards = cards.filter((card) => (!card.staffOnly || access.hasStaffRole) && (!card.permissions || card.permissions.some((permission) => permissions.has(permission)) || access.roleCodes.has("SUPER_ADMIN")));
  const displayName = profile?.full_name || "Betanor colleague";
  const primaryRole = roleNames[0] || "Authorized staff";

  return <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-[var(--betanor-blue)]">Betanor workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--betanor-navy)] sm:text-3xl">Your modules</h1><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">Welcome, {displayName}. These work areas are available to your {primaryRole.toLowerCase()} role.</p></div><div className="flex flex-wrap items-center gap-2"><Badge tone="info">{primaryRole}</Badge>{access.workspace ? <Badge tone="neutral">{access.workspace.name}</Badge> : null}<Link href="/workspace/overview" className="inline-flex min-h-9 items-center rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-xs font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-blue)]">Open overview</Link></div></div>
    {visibleCards.length ? <section aria-label="Available modules" className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleCards.map((module) => { const art = moduleArt[module.label]; return <Link key={module.label} href={module.href} className="group min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--betanor-blue)] focus-visible:ring-offset-2"><Card className={`relative isolate h-full min-w-0 overflow-hidden border-transparent bg-gradient-to-br ${art?.background ?? "from-slate-50 via-white to-blue-50"} p-4 transition duration-200 hover:-translate-y-1 hover:border-[var(--betanor-border)] hover:shadow-lg sm:p-5`}><span aria-hidden="true" className={`pointer-events-none absolute -right-7 -top-9 -z-10 size-32 rounded-full blur-2xl transition duration-300 group-hover:scale-125 ${art?.glow ?? "bg-blue-200/40"}`} /><div className="flex items-start justify-between gap-3"><span className={`grid size-11 shrink-0 place-items-center rounded-2xl shadow-sm ring-1 ring-black/5 ${art?.iconBackground ?? "bg-slate-100"} ${art?.iconColor ?? "text-slate-700"}`}><ModuleIcon name={art?.icon ?? "work"} /></span><span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-white/70 text-base text-[var(--betanor-muted)] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--betanor-blue)]">↗</span></div><h2 className="mt-4 text-base font-semibold text-[var(--betanor-navy)]">{module.label}</h2><p className="mt-1.5 min-h-10 text-sm leading-5 text-[var(--betanor-muted)]">{module.description}</p><span className="mt-4 inline-flex min-h-8 items-center text-xs font-semibold text-[var(--betanor-blue)]">Open module <span className="ml-1 transition-transform group-hover:translate-x-1">→</span></span></Card></Link>; })}</section> : <Card className="mt-7 p-6 text-sm text-[var(--betanor-muted)]">No modules are assigned yet. Contact a workspace administrator to review your access.</Card>}
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--betanor-border)] bg-white px-4 py-3"><p className="text-xs text-[var(--betanor-muted)]">Modules shown here are filtered using your current role and permissions.</p><Link href="/workspace/profile" className="inline-flex min-h-8 items-center text-xs font-semibold text-[var(--betanor-blue)] hover:underline">Personal area →</Link></div>
  </main>;
}
