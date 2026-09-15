"use client";

import Link from "next/link";
import { useState } from "react";

import { BetanorMark } from "@/components/brand/betanor-mark";

export function PublicHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const links = [["Services", "/services"], ["Products", "/products"], ["Solutions", "/projects"], ["Industries", "/industries"], ["Company", "/about"], ["Partner", "/partner"], ["RFQ", "/rfq"], ["Chat", "/chat"]] as const;

  return (
    <header className="relative border-b border-[var(--betanor-border)] bg-white shadow-[0_1px_0_rgba(18,53,107,0.03)]">
      <nav className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-6 px-6 lg:px-8" aria-label="Primary navigation">
        <Link href="/" aria-label="Betanor home">
          <BetanorMark className="flex items-center gap-3" />
        </Link>
        <div className="hidden items-center gap-6 text-sm font-medium text-[var(--betanor-muted)] lg:flex">
          {links.map(([label, href]) => <Link className="transition-colors hover:text-[var(--betanor-blue)]" href={href} key={href}>{label}</Link>)}
        </div>
        <div className="flex items-center gap-2 sm:gap-3"><Link className="hidden rounded-lg border border-[var(--betanor-border)] px-4 py-2 text-sm font-semibold text-[var(--betanor-navy)] sm:inline-flex" href="/partner">Partner with us</Link><Link className="rounded-lg bg-[var(--betanor-navy)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--betanor-blue)] sm:px-4" href="/contact#quote">Request a quote</Link><button aria-expanded={isOpen} aria-label="Open site navigation" className="grid size-10 place-items-center rounded-lg text-[var(--betanor-navy)] hover:bg-slate-100 lg:hidden" onClick={() => setIsOpen(!isOpen)}>☰</button></div>
      </nav>
      {isOpen && <div className="absolute inset-x-0 top-full z-40 border-b border-[var(--betanor-border)] bg-white px-6 py-5 shadow-lg lg:hidden"><div className="mx-auto grid max-w-7xl gap-1">{links.map(([label, href]) => <Link className="rounded-lg px-3 py-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-50" href={href} key={href} onClick={() => setIsOpen(false)}>{label}</Link>)}<Link className="rounded-lg px-3 py-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-50" href="/careers" onClick={() => setIsOpen(false)}>Careers</Link><Link className="rounded-lg px-3 py-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-50" href="/contact" onClick={() => setIsOpen(false)}>Contact</Link></div></div>}
    </header>
  );
}
