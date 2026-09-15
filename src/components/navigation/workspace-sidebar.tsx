"use client";

import Link from "next/link";
import { useState } from "react";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { Drawer } from "@/components/ui/drawer";

const sections = [
  ["Overview"],
  ["Sales & Clients", "CRM", "RFQs", "Quotations", "Contracts", "Chats"],
  ["Work", "Projects", "Tasks", "My Work"],
  ["People", "Employees", "Leave", "Recruitment", "KPIs"],
  ["Finance", "Finance Overview", "Expenses", "Budgets"],
];

function NavigationContents({ close }: { close?: () => void }) {
  return <>
    <Link href="/workspace" className="mb-9 flex items-center gap-3" onClick={close}>
      <BetanorMark className="flex items-center gap-3" dark />
    </Link>
    <nav aria-label="Workspace navigation" className="space-y-7">
      {sections.map(([label, ...items]) => (
        <section key={label}>
          {items.length > 0 && <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase">{label}</p>}
          <div className="space-y-1">
            {items.length === 0 ? (
              <Link href="/workspace" className="block rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white" onClick={close}>{label}</Link>
            ) : items.map((item) => <span key={item} className="block rounded-lg px-3 py-2 text-sm text-slate-300">{item}</span>)}
          </div>
        </section>
      ))}
    </nav>
  </>;
}

export function WorkspaceSidebar() {
  const [isOpen, setIsOpen] = useState(false);

  return <>
    <button aria-controls="workspace-mobile-navigation" aria-expanded={isOpen} aria-label="Open workspace navigation" className="fixed top-3 left-4 z-30 grid size-10 place-items-center rounded-lg border border-[var(--betanor-border)] bg-white text-lg text-[var(--betanor-navy)] shadow-sm lg:hidden" onClick={() => setIsOpen(true)}>☰</button>
    <aside className="hidden h-screen w-72 shrink-0 border-r border-slate-800 bg-[var(--betanor-dark-navy)] px-5 py-6 text-slate-300 lg:block"><NavigationContents /></aside>
    <Drawer isOpen={isOpen} onClose={() => setIsOpen(false)} title="Workspace navigation">
      <div className="h-full overflow-y-auto px-5 py-6" id="workspace-mobile-navigation">
        <button aria-label="Close workspace navigation" className="absolute top-4 right-4 grid size-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10" onClick={() => setIsOpen(false)}>×</button>
        <NavigationContents close={() => setIsOpen(false)} />
      </div>
    </Drawer>
  </>;
}
