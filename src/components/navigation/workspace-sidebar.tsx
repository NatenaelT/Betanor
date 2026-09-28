"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

type NavigationItem = { href?: string; label: string; description?: string; permission?: string | string[]; superAdminOnly?: boolean; staffOnly?: boolean };
type NavigationSection = { label?: string; icon: string; items: NavigationItem[] };

const sections: NavigationSection[] = [
  { icon: "home", items: [{ href: "/workspace", label: "Overview", description: "Workspace pulse" }] },
  { label: "People", icon: "people", items: [{ href: "/workspace/employees", label: "Employees", permission: ["hr.read", "hr.manage", "users.manage"] }, { href: "/workspace/leave", label: "Leave", permission: ["leave.request", "leave.approve"] }, { href: "/workspace/recruitment", label: "Recruitment", permission: "recruitment.manage" }, { href: "/workspace/payslips", label: "Payroll & payslips", permission: ["payroll.read_self", "payroll.manage"] }, { href: "/workspace/kpis", label: "KPIs", permission: ["kpi.read_self", "kpi.read_team", "kpi.configure", "kpi.review"] }] },
  { label: "Work", icon: "work", items: [{ href: "/workspace/projects", label: "Projects", permission: "project.manage" }, { href: "/workspace/tasks", label: "Tasks", permission: ["task.create", "task.assign", "task.edit"] }, { href: "/workspace/my-work", label: "My work", staffOnly: true }] },
  { label: "Support", icon: "support", items: [{ href: "/workspace/support", label: "IT Support / Managed Support", description: "RTSL service desk", permission: ["support.read", "support.create", "support.view_all", "support.manage_contracts"] }] },
  { label: "Finance", icon: "finance", items: [{ href: "/workspace/finance", label: "Finance overview", description: "Cash, budgets & receivables", permission: ["finance.read", "finance.create", "finance.approve"] }, { href: "/workspace/expenses", label: "Expenses", description: "Requests & approvals", permission: ["expense.request", "finance.read", "finance.create", "finance.approve"] }, { href: "/workspace/budgets", label: "Budgets", description: "Plan by year and project", permission: ["finance.read", "finance.create", "finance.approve"] }, { href: "/workspace/invoices", label: "Invoices & payments", description: "ETB billing ledger", permission: ["finance.read", "finance.create", "finance.approve"] }] },
  { label: "Documents", icon: "documents", items: [{ href: "/workspace/documents", label: "Files & documents", permission: "files.manage" }, { href: "/workspace/letters", label: "Letters", description: "Official correspondence", permission: ["letters.read", "letters.create", "letters.view_department", "letters.view_all"] }] },
  { label: "Sales & clients", icon: "sales", items: [{ href: "/workspace/crm", label: "CRM", permission: ["crm.read", "crm.write"] }, { href: "/workspace/rfqs", label: "RFQs", permission: ["rfq.read", "rfq.write"] }, { href: "/workspace/quotations", label: "Quotations", permission: ["quotation.create", "quotation.edit", "quotation.approve", "quotation.send"] }, { href: "/workspace/contracts", label: "Contracts", permission: ["contract.create", "contract.approve"] }, { href: "/workspace/chats", label: "Chats", permission: ["chat.manage", "chat.internal.read"] }, { href: "/workspace/emails", label: "Emails", description: "Business correspondence", permission: ["email.read", "email.read_all", "email.send"] }] },
  { label: "Tenders", icon: "tenders", items: [{ href: "/workspace/tenders", label: "Tender management", description: "Proposals, guarantees & submissions", permission: ["tender.read", "tender.create", "tender.view_all"] }] },
  { label: "System", icon: "system", items: [{ href: "/workspace/cms", label: "Content management", permission: ["cms.read", "cms.write", "cms.publish"] }, { href: "/workspace/products", label: "Product catalogue", permission: ["cms.read", "cms.write", "cms.publish"] }, { href: "/workspace/admin/settings", label: "System configuration", permission: "settings.manage" }, { href: "/workspace/style-guide", label: "Brand style", permission: "style.manage", superAdminOnly: true }] },
  { label: "Administration", icon: "admin", items: [{ href: "/workspace/admin/users", label: "Users & access", description: "Roles and customer portal links", permission: "users.manage" }, { href: "/workspace/admin/departments", label: "Departments & positions", description: "Conditional organization structure", permission: ["hr.manage", "users.manage"] }] },
  { label: "Help", icon: "help", items: [{ href: "/workspace/help", label: "Help & user manual", description: "Guidance for your assigned role" }, { href: "/workspace/admin/guides", label: "Programmer guide", description: "Download the technical guide", permission: ["users.manage", "settings.manage"] }] },
];

function NavIcon({ name, className }: { name: string; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (name) {
    case "home": return <svg {...common}><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z" /></svg>;
    case "people": return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.8M18 14a4.5 4.5 0 0 1 3 4.3V20" /></svg>;
    case "work": return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></svg>;
    case "support": return <svg {...common}><path d="M4 13v-2a8 8 0 0 1 16 0v2M4 13H3a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h2v-6zm16 0h1a1 1 0 0 1 1 1v3a2 2 0 0 1-2 2h-2v-6zM16 20a4 4 0 0 1-4 2h-1" /></svg>;
    case "finance": return <svg {...common}><path d="M4 19V5M4 19h17M8 16v-4m5 4V8m5 8v-7" /></svg>;
    case "documents": return <svg {...common}><path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M14 3v6h5M8 13h8m-8 4h8" /></svg>;
    case "sales": return <svg {...common}><path d="M4 19v-1a5 5 0 0 1 10 0v1M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7-5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v1" /></svg>;
    case "tenders": return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="m12 12 6-6" /></svg>;
    case "system": return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="11" cy="18" r="2" fill="currentColor" /></svg>;
    case "admin": return <svg {...common}><path d="M12 3 20 6v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6z" /><path d="m9 12 2 2 4-4" /></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.6 2.6 0 1 1 4.8 1.3c-.8 1-2.3 1.3-2.3 2.7m0 3h.01" /></svg>;
  }
}

function NavigationContents({
  close,
  collapsed = false,
  toggleCollapsed,
  permissionCodes = [],
  roleCodes = [],
  hasStaffRole = false,
}: {
  close?: () => void;
  collapsed?: boolean;
  toggleCollapsed?: () => void;
  permissionCodes?: string[];
  roleCodes?: string[];
  hasStaffRole?: boolean;
}) {
  const pathname = usePathname();
  const isSuperAdmin = roleCodes.includes("SUPER_ADMIN");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const canSee = (item: NavigationItem) => {
    if (item.staffOnly) return hasStaffRole;
    if (item.superAdminOnly) return isSuperAdmin;
    if (!item.permission || isSuperAdmin) return true;
    return Array.isArray(item.permission) ? item.permission.some((code) => permissionCodes.includes(code)) : permissionCodes.includes(item.permission);
  };

  return <div className="flex h-full min-h-0 flex-col">
    <div className={cn("flex min-h-20 items-center justify-between gap-2 border-b border-[var(--betanor-nav-text)]/10 px-4 py-4", collapsed && "justify-center px-2")}>
      <Link href="/workspace" aria-label="Betanor workspace overview" onClick={close} className="min-w-0">
        <BetanorMark className={cn("flex min-w-0 items-center gap-3", collapsed && "justify-center [&>span]:hidden")} dark />
      </Link>
      {toggleCollapsed ? <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand navigation" : "Collapse navigation"} className="hidden size-9 shrink-0 place-items-center rounded-xl text-lg text-[var(--betanor-nav-text)]/70 transition hover:bg-[var(--betanor-nav-hover)] hover:text-[var(--betanor-nav-text)] lg:grid">{collapsed ? "›" : "‹"}</button> : null}
      {close ? <button type="button" onClick={close} aria-label="Close navigation" className="grid size-9 shrink-0 place-items-center rounded-xl text-xl text-[var(--betanor-nav-text)]/70 hover:bg-[var(--betanor-nav-hover)] hover:text-[var(--betanor-nav-text)]">×</button> : null}
    </div>

    <nav aria-label="Workspace navigation" className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-5", collapsed && "px-2")}>
      {sections.map((section, index) => {
        const visibleItems = section.items.filter(canSee);
        if (!visibleItems.length) return null;
        const groupKey = section.label ?? "Overview";
        const expanded = openSections[groupKey] ?? true;
        return <section key={groupKey} className={cn(index > 0 && "border-t border-[var(--betanor-nav-text)]/10 pt-3")}>
          {section.label && !collapsed ? <button type="button" aria-expanded={expanded} onClick={() => setOpenSections((current) => ({ ...current, [groupKey]: !expanded }))} className="mb-1 flex min-h-8 w-full items-center justify-between px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--betanor-nav-text)]/55 transition hover:text-[var(--betanor-nav-text)]"><span>{section.label}</span><span aria-hidden="true" className={cn("text-xs transition-transform", expanded ? "rotate-90" : "")}>›</span></button> : null}
          {expanded || collapsed ? <div className="space-y-1">{visibleItems.map((item) => {
            const active = Boolean(item.href) && (item.href === "/workspace" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
            const className = cn("group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors", active ? "bg-[var(--betanor-nav-hover)] font-semibold text-[var(--betanor-nav-text)] shadow-sm" : "text-[var(--betanor-nav-text)]/75 hover:bg-[var(--betanor-nav-text)]/8 hover:text-[var(--betanor-nav-text)]", collapsed && "justify-center px-0");
            const initials = item.label.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.slice(0, 1)).join("").toUpperCase();
            const icon = <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-[var(--betanor-nav-text)]/65 transition-colors group-hover:bg-[var(--betanor-nav-text)]/8 group-hover:text-[var(--betanor-nav-text)]", active && "bg-[var(--betanor-nav-text)]/10 text-[var(--betanor-nav-edge)]")}>{collapsed ? <span className="text-[9px] font-bold tracking-tight">{initials}</span> : <NavIcon name={section.icon} className="size-[18px]" />}</span>;
            const content = <>{icon}<span className={cn("min-w-0 flex-1", collapsed && "sr-only")}><span className="block truncate">{item.label}</span>{item.description ? <span className="mt-0.5 block truncate text-[10px] font-normal text-[var(--betanor-nav-text)]/50">{item.description}</span> : null}</span>{active && !collapsed ? <span className="mr-1 size-1.5 rounded-full bg-[var(--betanor-nav-edge)]" /> : null}</>;
            return item.href ? <Link key={item.label} href={item.href} aria-label={collapsed ? item.label : undefined} title={collapsed ? item.label : undefined} className={className} onClick={close}>{content}</Link> : <span key={item.label} className={className} title={collapsed ? item.label : undefined}>{content}</span>;
          })}</div> : null}
        </section>;
      })}
    </nav>

    {toggleCollapsed ? <div className={cn("border-t border-[var(--betanor-nav-text)]/10 p-3", collapsed && "px-2")}><button type="button" onClick={toggleCollapsed} className={cn("flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-xs font-semibold text-[var(--betanor-nav-text)]/65 transition hover:bg-[var(--betanor-nav-hover)] hover:text-[var(--betanor-nav-text)]", collapsed && "justify-center px-0")}><span className="text-base" aria-hidden="true">{collapsed ? "›" : "‹"}</span><span className={cn(collapsed && "sr-only")}>{collapsed ? "Expand navigation" : "Minimize navigation"}</span></button></div> : null}
  </div>;
}

export function WorkspaceSidebar({ permissionCodes = [], roleCodes = [], hasStaffRole = false }: { permissionCodes?: string[]; roleCodes?: string[]; hasStaffRole?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return <>
    <button aria-controls="workspace-mobile-navigation" aria-expanded={isOpen} aria-label="Open workspace navigation" className="fixed top-3 left-4 z-30 grid size-10 place-items-center rounded-xl border border-[var(--betanor-field-border)] bg-[var(--betanor-header-bg)] text-lg text-[var(--betanor-header-text)] shadow-sm lg:hidden print:hidden" onClick={() => setIsOpen(true)}>☰</button>
    <aside className={cn("sticky top-0 hidden h-screen shrink-0 border-r border-[var(--betanor-nav-text)]/10 bg-[var(--betanor-nav-bg)] text-[var(--betanor-nav-text)] transition-[width] duration-200 lg:block print:hidden", collapsed ? "w-[76px]" : "w-[286px]")}>
      <NavigationContents collapsed={collapsed} toggleCollapsed={() => setCollapsed((value) => !value)} permissionCodes={permissionCodes} roleCodes={roleCodes} hasStaffRole={hasStaffRole} />
    </aside>
    <Drawer isOpen={isOpen} onClose={() => setIsOpen(false)} title="Workspace navigation">
      <div className="h-full overflow-hidden" id="workspace-mobile-navigation"><NavigationContents close={() => setIsOpen(false)} permissionCodes={permissionCodes} roleCodes={roleCodes} hasStaffRole={hasStaffRole} /></div>
    </Drawer>
  </>;
}
