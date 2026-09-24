"use client";

import { useMemo, useState } from "react";

import type { HelpFaq } from "@/lib/help-content";

export function FaqList({ items, title = "Frequently asked questions" }: { items: HelpFaq[]; title?: string }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? items.filter((item) => `${item.question} ${item.answer}`.toLowerCase().includes(normalized))
      : items;
  }, [items, query]);

  return <section aria-labelledby="faq-title" className="mt-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Quick answers</p><h2 id="faq-title" className="mt-2 text-xl font-semibold text-[var(--betanor-navy)]">{title}</h2></div>
      <label className="block w-full sm:max-w-xs"><span className="sr-only">Search frequently asked questions</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions" className="min-h-11 w-full rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 text-sm text-[var(--betanor-text)] outline-none focus:border-[var(--betanor-blue)] focus:ring-2 focus:ring-blue-100" /></label>
    </div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{visible.map((item) => <details key={item.question} className="group rounded-xl border border-[var(--betanor-border)] bg-white p-4 open:border-blue-200 open:bg-blue-50/30 sm:p-5"><summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-[var(--betanor-navy)] marker:hidden [&::-webkit-details-marker]:hidden">{item.question}<span aria-hidden="true" className="shrink-0 text-lg text-[var(--betanor-blue)] transition-transform group-open:rotate-45">+</span></summary><p className="mt-3 max-w-prose text-sm leading-6 text-[var(--betanor-muted)]">{item.answer}</p></details>)}</div>
    {visible.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-[var(--betanor-border)] px-4 py-5 text-sm text-[var(--betanor-muted)]">No matching questions. Try a different search or contact Betanor support.</p> : null}
  </section>;
}
