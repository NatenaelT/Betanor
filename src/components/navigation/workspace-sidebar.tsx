"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

type NavigationItem = { href?: string; label: string };
type NavigationSection = { label?: string; items: NavigationItem[] };

const sections: NavigationSection[] = [
  { items: [{ href: "/workspace", label: "Overview" }] },
  { label: "Sales & clients", items: [{ label: "CRM" }, { label: "RFQs" }, { label: "Quotations" }, { label: "Contracts" }, { label: "Chats" }] },
  { label: "Work", items: [{ label: "Projects" }, { label: "Tasks" }, { label: "My work" }] },
  { label: "People", items: [{ label: "Employees" }, { label: "Leave" }, { label: "Recruitment" }, { label: "KPIs" }] },
  { label: "Finance", items: [{ label: "Finance overview" }, { label: "Expenses" }, { label: "Budgets" }] },
  { label: "System", items: [{ href: "/workspace/style-guide", label: "Style guide" }] },
];

function NavigationContents({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return <>
    <Link href="/workspace" className="mb-8 flex items-center gap-3" onClick={close}><BetanorMark className="flex items-center gap-3" dark /></Link>
    <nav aria-label="Workspace navigation" className="space-y-6">
      {sections.map((section) => <section key={section.label ?? "overview"}>
        {section.label ? <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.15em] text-slate-500 uppercase">{section.label}</p> : null}
        <div className="space-y-1">{section.items.map((item) => {
          const active = item.href === pathname;
          const className = cn("flex min-h-10 items-center rounded-lg px-3 text-sm transition-colors", active ? "bg-white/12 font-semibold text-white shadow-sm" : "text-slate-300", item.href ? "hover:bg-white/8 hover:text-white" : "cursor-default opacity-75");
          return item.href ? <Link key={item.label} href={item.href} className={className} onClick={close}>{item.label}</Link> : <span key={item.label} className={className}>{item.label}</span>;
        })}</div>
      </section>)}
    </nav>
  </>;
}

export function WorkspaceSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  return <>
    <button aria-controls="workspace-mobile-navigation" aria-expanded={isOpen} aria-label="Open workspace navigation" className="fixed top-3 left-4 z-30 grid size-10 place-items-center rounded-lg border border-[var(--betanor-border)] bg-white text-lg text-[var(--betanor-navy)] shadow-sm lg:hidden" onClick={() => setIsOpen(true)}>☰</button>
    <aside className="hidden h-screen w-72 shrink-0 border-r border-slate-800 bg-[var(--betanor-dark-navy)] px-5 py-6 text-slate-300 lg:block"><NavigationContents /></aside>
    <Drawer isOpen={isOpen} onClose={() => setIsOpen(false)} title="Workspace navigation"><div className="h-full overflow-y-auto px-5 py-6" id="workspace-mobile-navigation"><button aria-label="Close workspace navigation" className="absolute top-4 right-4 grid size-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10" onClick={() => setIsOpen(false)}>×</button><NavigationContents close={() => setIsOpen(false)} /></div></Drawer>
  </>;
}
