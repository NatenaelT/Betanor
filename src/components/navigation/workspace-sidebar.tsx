import Link from "next/link";

import { BetanorMark } from "@/components/brand/betanor-mark";

const sections = [
  ["Overview"],
  ["Sales & Clients", "CRM", "RFQs", "Quotations", "Contracts", "Chats"],
  ["Work", "Projects", "Tasks", "My Work"],
  ["People", "Employees", "Leave", "Recruitment", "KPIs"],
  ["Finance", "Finance Overview", "Expenses", "Budgets"],
];

export function WorkspaceSidebar() {
  return (
    <aside className="hidden h-screen w-72 shrink-0 border-r border-slate-800 bg-[var(--betanor-dark-navy)] px-5 py-6 text-slate-300 lg:block">
      <Link href="/workspace" className="mb-9 flex items-center gap-3">
        <BetanorMark className="flex items-center gap-3 [&_span:first-child]:bg-[var(--betanor-gold)] [&_span:first-child]:text-[var(--betanor-navy)] [&_span:nth-child(2)>span:first-child]:text-white [&_span:nth-child(2)>span:last-child]:text-slate-400" />
      </Link>
      <nav aria-label="Workspace navigation" className="space-y-7">
        {sections.map(([label, ...items]) => (
          <section key={label}>
            {items.length > 0 && <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase">{label}</p>}
            <div className="space-y-1">
              {items.length === 0 ? (
                <Link href="/workspace" className="block rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white">{label}</Link>
              ) : items.map((item) => (
                <span key={item} className="block rounded-md px-3 py-2 text-sm">{item}</span>
              ))}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  );
}
