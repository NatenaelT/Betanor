"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

type NavigationItem = { href?: string; label: string; description?: string; permission?: string | string[] };
type NavigationSection = { label?: string; items: NavigationItem[] };

const sections: NavigationSection[] = [
  { items: [{ href: "/workspace", label: "Overview", description: "Workspace pulse" }] },
  { label: "Sales & clients", items: [{ href: "/workspace/crm", label: "CRM", permission: ["crm.read", "crm.write"] }, { href: "/workspace/rfqs", label: "RFQs", permission: ["rfq.read", "rfq.write"] }, { href: "/workspace/quotations", label: "Quotations", permission: ["quotation.create", "quotation.edit", "quotation.approve", "quotation.send"] }, { href: "/workspace/contracts", label: "Contracts", permission: ["contract.create", "contract.approve"] }, { href: "/workspace/chats", label: "Chats", permission: ["crm.read", "crm.write"] }] },
  { label: "Work", items: [{ href: "/workspace/projects", label: "Projects", permission: "project.manage" }, { href: "/workspace/tasks", label: "Tasks", permission: ["task.create", "task.assign", "task.edit"] }, { href: "/workspace/my-work", label: "My work", permission: ["task.edit", "kpi.read_self"] }] },
  { label: "People", items: [{ href: "/workspace/employees", label: "Employees", permission: ["hr.read", "hr.manage", "users.manage"] }, { href: "/workspace/leave", label: "Leave", permission: ["leave.request", "leave.approve"] }, { href: "/workspace/recruitment", label: "Recruitment", permission: "recruitment.manage" }, { href: "/workspace/payslips", label: "Payroll & payslips", permission: ["payroll.read_self", "payroll.manage"] }, { href: "/workspace/kpis", label: "KPIs", permission: ["kpi.read_self", "kpi.read_team", "kpi.configure", "kpi.review"] }] },
  { label: "Finance", items: [{ href: "/workspace/finance", label: "Finance overview", description: "Cash, budgets & receivables", permission: ["finance.read", "finance.create", "finance.approve"] }, { href: "/workspace/expenses", label: "Expenses", description: "Requests & approvals", permission: ["expense.request", "finance.read", "finance.create", "finance.approve"] }, { href: "/workspace/budgets", label: "Budgets", description: "Plan by year and project", permission: ["finance.read", "finance.create", "finance.approve"] }, { href: "/workspace/invoices", label: "Invoices & payments", description: "ETB billing ledger", permission: ["finance.read", "finance.create", "finance.approve"] }] },
  { label: "System", items: [{ href: "/workspace/cms", label: "Content management", permission: ["cms.read", "cms.write", "cms.publish"] }, { href: "/workspace/products", label: "Product catalogue", permission: ["cms.read", "cms.write", "cms.publish"] }, { href: "/workspace/documents", label: "Files & documents", permission: "files.manage" }, { href: "/workspace/admin/settings", label: "System configuration", permission: "settings.manage" }, { href: "/workspace/style-guide", label: "Style guide" }] },
  { label: "Administration", items: [{ href: "/workspace/admin/users", label: "Users & access", description: "Roles and customer portal links", permission: "users.manage" }, { href: "/workspace/admin/settings", label: "Workspace settings", permission: "settings.manage" }] },
];

function NavigationContents({ close, permissionCodes = [], roleCodes = [] }: { close?: () => void; permissionCodes?: string[]; roleCodes?: string[] }) {
  const pathname = usePathname();
  const isSuperAdmin = roleCodes.includes("SUPER_ADMIN");
  const canSee = (permission?: string | string[]) => !permission || isSuperAdmin || (Array.isArray(permission) ? permission.some((code) => permissionCodes.includes(code)) : permissionCodes.includes(permission));
  return <>
    <Link href="/workspace" className="mb-8 flex items-center gap-3" onClick={close}><BetanorMark className="flex items-center gap-3" dark /></Link>
    <nav aria-label="Workspace navigation" className="space-y-6">
      {sections.map((section) => { const visibleItems = section.items.filter((item) => canSee(item.permission)); if (!visibleItems.length) return null; return <section key={section.label ?? "overview"}>
        {section.label ? <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.15em] text-slate-500 uppercase">{section.label}</p> : null}
        <div className="space-y-1">{visibleItems.map((item) => {
          const active = Boolean(item.href) && (item.href === "/workspace" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
          const className = cn("group flex min-h-10 items-center rounded-lg border border-transparent px-3 text-sm transition-colors", active ? "border-white/10 bg-white/12 font-semibold text-white shadow-sm" : "text-slate-300", item.href ? "hover:border-white/10 hover:bg-white/8 hover:text-white" : "cursor-default opacity-75");
          const content = <><span className={cn("mr-3 size-1.5 shrink-0 rounded-full", active ? "bg-[var(--betanor-gold)]" : "bg-slate-600 group-hover:bg-slate-400")} /><span className="min-w-0"><span className="block truncate">{item.label}</span>{item.description ? <span className={cn("mt-0.5 block truncate text-[10px] font-normal", active ? "text-slate-300" : "text-slate-500 group-hover:text-slate-400")}>{item.description}</span> : null}</span></>;
          return item.href ? <Link key={item.label} href={item.href} className={className} onClick={close}>{content}</Link> : <span key={item.label} className={className}>{content}</span>;
        })}</div>
      </section>; })}
    </nav>
  </>;
}

export function WorkspaceSidebar({ permissionCodes = [], roleCodes = [] }: { permissionCodes?: string[]; roleCodes?: string[] }) {
  const [isOpen, setIsOpen] = useState(false);
  return <>
    <button aria-controls="workspace-mobile-navigation" aria-expanded={isOpen} aria-label="Open workspace navigation" className="fixed top-3 left-4 z-30 grid size-10 place-items-center rounded-lg border border-[var(--betanor-border)] bg-white text-lg text-[var(--betanor-navy)] shadow-sm lg:hidden" onClick={() => setIsOpen(true)}>☰</button>
    <aside className="hidden h-screen max-h-screen w-72 shrink-0 overflow-y-auto border-r border-slate-800 bg-[var(--betanor-dark-navy)] px-5 py-6 text-slate-300 lg:sticky lg:top-0 lg:block"><NavigationContents permissionCodes={permissionCodes} roleCodes={roleCodes} /></aside>
    <Drawer isOpen={isOpen} onClose={() => setIsOpen(false)} title="Workspace navigation"><div className="h-full overflow-y-auto px-5 py-6" id="workspace-mobile-navigation"><button aria-label="Close workspace navigation" className="absolute top-4 right-4 grid size-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10" onClick={() => setIsOpen(false)}>×</button><NavigationContents close={() => setIsOpen(false)} permissionCodes={permissionCodes} roleCodes={roleCodes} /></div></Drawer>
  </>;
}
