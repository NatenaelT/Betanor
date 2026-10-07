import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";
type ModuleCard = { label: string; description: string; href: string; permissions?: string[]; staffOnly?: boolean };

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
    {visibleCards.length ? <section aria-label="Available modules" className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleCards.map((module, index) => <Link key={module.label} href={module.href} className="group min-w-0"><Card className="h-full min-w-0 border-[var(--betanor-border)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--betanor-blue)] hover:shadow-md sm:p-5"><div className="flex items-start justify-between gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--betanor-blue)_9%,white)] text-sm font-bold text-[var(--betanor-blue)]">{String(index + 1).padStart(2, "0")}</span><span aria-hidden="true" className="text-[var(--betanor-muted)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--betanor-blue)]">↗</span></div><h2 className="mt-4 text-base font-semibold text-[var(--betanor-navy)]">{module.label}</h2><p className="mt-1.5 min-h-10 text-sm leading-5 text-[var(--betanor-muted)]">{module.description}</p><span className="mt-4 inline-flex min-h-8 items-center text-xs font-semibold text-[var(--betanor-blue)]">Open module <span className="ml-1">→</span></span></Card></Link>)}</section> : <Card className="mt-7 p-6 text-sm text-[var(--betanor-muted)]">No modules are assigned yet. Contact a workspace administrator to review your access.</Card>}
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--betanor-border)] bg-white px-4 py-3"><p className="text-xs text-[var(--betanor-muted)]">Modules shown here are filtered using your current role and permissions.</p><Link href="/workspace/profile" className="inline-flex min-h-8 items-center text-xs font-semibold text-[var(--betanor-blue)] hover:underline">Personal area →</Link></div>
  </main>;
}
