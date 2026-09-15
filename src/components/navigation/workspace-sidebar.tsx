"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

type NavigationItem = { href?: string; label: string; description?: string };
type NavigationSection = { label?: string; items: NavigationItem[] };

const sections: NavigationSection[] = [
  { items: [{ href: "/workspace", label: "Overview", description: "Workspace pulse" }] },
  { label: "Sales & clients", items: [{ href: "/workspace/crm", label: "CRM" }, { href: "/workspace/rfqs", label: "RFQs" }, { href: "/workspace/quotations", label: "Quotations" }, { href: "/workspace/contracts", label: "Contracts" }, { href: "/workspace/chats", label: "Chats" }] },
  { label: "Work", items: [{ href: "/workspace/projects", label: "Projects" }, { href: "/workspace/tasks", label: "Tasks" }, { href: "/workspace/my-work", label: "My work" }] },
  { label: "People", items: [{ href: "/workspace/employees", label: "Employees" }, { href: "/workspace/leave", label: "Leave" }, { href: "/workspace/recruitment", label: "Recruitment" }, { label: "KPIs" }] },
  { label: "Finance", items: [{ href: "/workspace/finance", label: "Finance overview", description: "Cash, budgets & receivables" }, { href: "/workspace/expenses", label: "Expenses", description: "Requests & approvals" }, { href: "/workspace/budgets", label: "Budgets", description: "Plan by year and project" }, { href: "/workspace/invoices", label: "Invoices & payments", description: "ETB billing ledger" }] },
  { label: "System", items: [{ href: "/workspace/cms", label: "Content management" }, { href: "/workspace/products", label: "Product catalogue" }, { href: "/workspace/style-guide", label: "Style guide" }] },
];

function NavigationContents({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return <>
    <Link href="/workspace" className="mb-8 flex items-center gap-3" onClick={close}><BetanorMark className="flex items-center gap-3" dark /></Link>
    <nav aria-label="Workspace navigation" className="space-y-6">
      {sections.map((section) => <section key={section.label ?? "overview"}>
        {section.label ? <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.15em] text-slate-500 uppercase">{section.label}</p> : null}
        <div className="space-y-1">{section.items.map((item) => {
          const active = Boolean(item.href) && (item.href === "/workspace" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
          const className = cn("group flex min-h-10 items-center rounded-lg border border-transparent px-3 text-sm transition-colors", active ? "border-white/10 bg-white/12 font-semibold text-white shadow-sm" : "text-slate-300", item.href ? "hover:border-white/10 hover:bg-white/8 hover:text-white" : "cursor-default opacity-75");
          const content = <><span className={cn("mr-3 size-1.5 shrink-0 rounded-full", active ? "bg-[var(--betanor-gold)]" : "bg-slate-600 group-hover:bg-slate-400")} /><span className="min-w-0"><span className="block truncate">{item.label}</span>{item.description ? <span className={cn("mt-0.5 block truncate text-[10px] font-normal", active ? "text-slate-300" : "text-slate-500 group-hover:text-slate-400")}>{item.description}</span> : null}</span></>;
          return item.href ? <Link key={item.label} href={item.href} className={className} onClick={close}>{content}</Link> : <span key={item.label} className={className}>{content}</span>;
        })}</div>
      </section>)}
    </nav>
  </>;
}

export function WorkspaceSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  return <>
    <button aria-controls="workspace-mobile-navigation" aria-expanded={isOpen} aria-label="Open workspace navigation" className="fixed top-3 left-4 z-30 grid size-10 place-items-center rounded-lg border border-[var(--betanor-border)] bg-white text-lg text-[var(--betanor-navy)] shadow-sm lg:hidden" onClick={() => setIsOpen(true)}>☰</button>
    <aside className="hidden h-screen w-72 shrink-0 border-r border-slate-800 bg-[var(--betanor-dark-navy)] px-5 py-6 text-slate-300 lg:sticky lg:top-0 lg:block"><NavigationContents /></aside>
    <Drawer isOpen={isOpen} onClose={() => setIsOpen(false)} title="Workspace navigation"><div className="h-full overflow-y-auto px-5 py-6" id="workspace-mobile-navigation"><button aria-label="Close workspace navigation" className="absolute top-4 right-4 grid size-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10" onClick={() => setIsOpen(false)}>×</button><NavigationContents close={() => setIsOpen(false)} /></div></Drawer>
  </>;
}
