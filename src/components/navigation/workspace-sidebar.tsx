"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

type NavigationItem = { href?: string; label: string; description?: string; permission?: string | string[]; superAdminOnly?: boolean; staffOnly?: boolean };
type NavigationSection = { label?: string; items: NavigationItem[] };

const sections: NavigationSection[] = [
  { items: [{ href: "/workspace", label: "Overview", description: "Workspace pulse" }] },
  { label: "People", items: [{ href: "/workspace/employees", label: "Employees", permission: ["hr.read", "hr.manage", "users.manage"] }, { href: "/workspace/leave", label: "Leave", permission: ["leave.request", "leave.approve"] }, { href: "/workspace/recruitment", label: "Recruitment", permission: "recruitment.manage" }, { href: "/workspace/payslips", label: "Payroll & payslips", permission: ["payroll.read_self", "payroll.manage"] }, { href: "/workspace/kpis", label: "KPIs", permission: ["kpi.read_self", "kpi.read_team", "kpi.configure", "kpi.review"] }] },
  { label: "Work", items: [{ href: "/workspace/projects", label: "Projects", permission: "project.manage" }, { href: "/workspace/tasks", label: "Tasks", permission: ["task.create", "task.assign", "task.edit"] }, { href: "/workspace/my-work", label: "My work", staffOnly: true }] },
  { label: "Support", items: [{ href: "/workspace/support", label: "IT Support / Managed Support", description: "RTSL service desk", permission: ["support.read", "support.create", "support.view_all", "support.manage_contracts"] }] },
  { label: "Finance", items: [{ href: "/workspace/finance", label: "Finance overview", description: "Cash, budgets & receivables", permission: ["finance.read", "finance.create", "finance.approve"] }, { href: "/workspace/expenses", label: "Expenses", description: "Requests & approvals", permission: ["expense.request", "finance.read", "finance.create", "finance.approve"] }, { href: "/workspace/budgets", label: "Budgets", description: "Plan by year and project", permission: ["finance.read", "finance.create", "finance.approve"] }, { href: "/workspace/invoices", label: "Invoices & payments", description: "ETB billing ledger", permission: ["finance.read", "finance.create", "finance.approve"] }] },
  { label: "Documents", items: [{ href: "/workspace/documents", label: "Files & documents", permission: "files.manage" }, { href: "/workspace/letters", label: "Letters", description: "Official correspondence", permission: ["letters.read", "letters.create", "letters.view_department", "letters.view_all"] }] },
  { label: "Sales & clients", items: [{ href: "/workspace/crm", label: "CRM", permission: ["crm.read", "crm.write"] }, { href: "/workspace/rfqs", label: "RFQs", permission: ["rfq.read", "rfq.write"] }, { href: "/workspace/quotations", label: "Quotations", permission: ["quotation.create", "quotation.edit", "quotation.approve", "quotation.send"] }, { href: "/workspace/contracts", label: "Contracts", permission: ["contract.create", "contract.approve"] }, { href: "/workspace/chats", label: "Chats", permission: ["chat.manage", "chat.internal.read"] }, { href: "/workspace/emails", label: "Emails", description: "Business correspondence", permission: ["email.read", "email.read_all", "email.send"] }] },
  { label: "Tenders", items: [{ href: "/workspace/tenders", label: "Tender management", description: "Proposals, guarantees & submissions", permission: ["tender.read", "tender.create", "tender.view_all"] }] },
  { label: "System", items: [{ href: "/workspace/cms", label: "Content management", permission: ["cms.read", "cms.write", "cms.publish"] }, { href: "/workspace/products", label: "Product catalogue", permission: ["cms.read", "cms.write", "cms.publish"] }, { href: "/workspace/admin/settings", label: "System configuration", permission: "settings.manage" }, { href: "/workspace/style-guide", label: "Brand style", permission: "style.manage", superAdminOnly: true }] },
  { label: "Administration", items: [{ href: "/workspace/admin/users", label: "Users & access", description: "Roles and customer portal links", permission: "users.manage" }, { href: "/workspace/admin/departments", label: "Departments & positions", description: "Conditional organization structure", permission: ["hr.manage", "users.manage"] }] },
  { label: "Help", items: [{ href: "/workspace/help", label: "Help & user manual", description: "Guidance for your assigned role" }, { href: "/workspace/admin/guides", label: "Programmer guide", description: "Download the technical guide", permission: ["users.manage", "settings.manage"] }] },
];

const iconByLabel: Record<string, string> = {
  Overview: "overview", Employees: "employee", Leave: "leave", Recruitment: "recruitment", "Payroll & payslips": "payroll", KPIs: "kpi",
  Projects: "projects", Tasks: "tasks", "My work": "my-work", "IT Support / Managed Support": "support", "Finance overview": "finance",
  Expenses: "expenses", Budgets: "budget", "Invoices & payments": "invoice", "Files & documents": "files", Letters: "letters", CRM: "crm",
  RFQs: "rfq", Quotations: "quotation", Contracts: "contract", Chats: "chat", Emails: "email", "Tender management": "tender",
  "Content management": "content", "Product catalogue": "products", "System configuration": "settings", "Brand style": "brand",
  "Users & access": "users", "Departments & positions": "departments", "Help & user manual": "help", "Programmer guide": "guide",
};

function NavIcon({ name, className }: { name: string; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (name) {
    case "overview": return <svg {...common}><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z" /></svg>;
    case "employee": return <svg {...common}><circle cx="12" cy="7" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2M19 8h3m-1.5-1.5v3" /></svg>;
    case "leave": return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18m-13 4h4m-4 3h7" /></svg>;
    case "recruitment": return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1m3-12h4m-2-2v4m-2 7h4m-4 3h4" /></svg>;
    case "payroll": return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h3m3 0h4m-10 4h2m3 0h5" /></svg>;
    case "kpi": return <svg {...common}><path d="M4 19V5m0 14h16" /><path d="m7 15 4-4 3 2 5-7" /><circle cx="19" cy="6" r="1" fill="currentColor" /></svg>;
    case "projects": return <svg {...common}><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M8 5V3h8v2M3 10h18m-12 4h6" /></svg>;
    case "tasks": return <svg {...common}><path d="m4 7 2 2 4-4M12 7h8M4 15l2 2 4-4m2 2h8" /></svg>;
    case "my-work": return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0m-8-5v5m-3-3 3 3 3-3" /></svg>;
    case "support": return <svg {...common}><path d="M4 13v-2a8 8 0 0 1 16 0v2M4 13H3a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h2v-6zm16 0h1a1 1 0 0 1 1 1v3a2 2 0 0 1-2 2h-2v-6zM16 20a4 4 0 0 1-4 2h-1" /></svg>;
    case "finance": return <svg {...common}><path d="M4 19V5M4 19h17M8 16v-4m5 4V8m5 8v-7" /></svg>;
    case "expenses": return <svg {...common}><path d="M4 7h16v13H4zM7 7V4h10v3M8 12h8m-8 4h5" /><path d="m16 16 2 2 3-4" /></svg>;
    case "budget": return <svg {...common}><path d="M4 20V4m0 16h16" /><path d="M7 16h3v-5H7zm7 0h3V7h-3z" /><path d="M7 8h3m4-4h3" /></svg>;
    case "invoice": return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6m-6 4h6m-6 4h3" /></svg>;
    case "files": return <svg {...common}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 10h18" /></svg>;
    case "letters": return <svg {...common}><path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M14 3v6h5M8 13h8m-8 4h8" /></svg>;
    case "crm": return <svg {...common}><circle cx="9" cy="8" r="3" /><circle cx="18" cy="9" r="2" /><path d="M3 20v-1a6 6 0 0 1 12 0v1m1-5a4 4 0 0 1 5 4v1" /></svg>;
    case "rfq": return <svg {...common}><path d="M5 3h14v18l-3-2-4 2-4-2-3 2z" /><path d="M8 8h8m-8 4h5m-5 4h3" /><circle cx="17" cy="16" r="2" /></svg>;
    case "quotation": return <svg {...common}><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h4m4 0h1m-9 3h8" /><path d="m16 2 2 3-2 3" /></svg>;
    case "contract": return <svg {...common}><path d="M5 3h10l4 4v14H5z" /><path d="M15 3v5h4M8 12h8m-8 3h5m-5 3h3" /><path d="m14 18 2 2 4-5" /></svg>;
    case "chat": return <svg {...common}><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8 8 0 0 1-4-.9L4 20l1.3-3.5A7 7 0 0 1 4 12c0-4.2 3.6-7 8-7s8 2.3 8 6.5z" /><path d="M8 12h.01m4 0h.01m4 0h.01" /></svg>;
    case "email": return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
    case "tender": return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="m12 12 6-6" /></svg>;
    case "content": return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 9v11m4-7h5m-5 4h5" /></svg>;
    case "products": return <svg {...common}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg>;
    case "settings": return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.8-.7a8 8 0 0 1-1.6.9l-.3 1.9h-2.8l-.3-1.9a8 8 0 0 1-1.6-.9l-1.8.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.9l-1.4-1.1 1.4-2.4 1.8.7a8 8 0 0 1 1.6-.9l.3-1.9h2.8l.3 1.9a8 8 0 0 1 1.6.9l1.8-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.9z" transform="translate(-1 -2)" /></svg>;
    case "brand": return <svg {...common}><path d="M12 3 14.8 9l6.2.7-4.6 4.2 1.2 6.1L12 17l-5.6 3 1.2-6.1L3 9.7 9.2 9z" /><circle cx="18.5" cy="5.5" r="1.5" /></svg>;
    case "users": return <svg {...common}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20v-1a6 6 0 0 1 12 0v1m1-5a4 4 0 0 1 5 4v1M19 3v4m-2-2h4" /></svg>;
    case "departments": return <svg {...common}><rect x="8" y="3" width="8" height="5" rx="1" /><rect x="2" y="16" width="8" height="5" rx="1" /><rect x="14" y="16" width="8" height="5" rx="1" /><path d="M12 8v4M6 12h12M6 12v4m12-4v4" /></svg>;
    case "guide": return <svg {...common}><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v18H7.5A3.5 3.5 0 0 0 4 23z" /><path d="M4 5.5v14A3.5 3.5 0 0 1 7.5 16H20M8 6h8m-8 4h8" /></svg>;
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
      {sections.map((section) => {
        const visibleItems = section.items.filter(canSee);
        if (!visibleItems.length) return null;
        const groupKey = section.label ?? "Overview";
        const expanded = openSections[groupKey] ?? true;
        return <section key={groupKey}>
          {section.label && !collapsed ? <button type="button" aria-expanded={expanded} onClick={() => setOpenSections((current) => ({ ...current, [groupKey]: !expanded }))} className="mb-1 flex min-h-9 w-full items-center justify-between px-3 text-sm font-bold uppercase tracking-[0.11em] text-[var(--betanor-nav-text)]/65 transition hover:text-[var(--betanor-nav-text)]"><span>{section.label}</span><span aria-hidden="true" className={cn("text-xs transition-transform", expanded ? "rotate-90" : "")}>›</span></button> : null}
          {expanded || collapsed ? <div className="space-y-1">{visibleItems.map((item) => {
            const active = Boolean(item.href) && (item.href === "/workspace" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
            const className = cn("group relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-xs transition-colors", active ? "bg-[var(--betanor-nav-hover)] font-semibold text-[var(--betanor-nav-text)] shadow-sm" : "text-[var(--betanor-nav-text)]/75 hover:bg-[var(--betanor-nav-text)]/8 hover:text-[var(--betanor-nav-text)]", collapsed && "justify-center px-0");
            const icon = <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-[var(--betanor-nav-text)]/65 transition-colors group-hover:bg-[var(--betanor-nav-text)]/8 group-hover:text-[var(--betanor-nav-text)]", active && "bg-[var(--betanor-nav-text)]/10 text-[var(--betanor-nav-edge)]")}><NavIcon name={iconByLabel[item.label] ?? "help"} className="size-[18px]" /></span>;
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
