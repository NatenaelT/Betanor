"use client";

import Link from "next/link";
import { useState } from "react";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { AuthenticatedProfileButton } from "@/components/auth/authenticated-profile-button";

export function PublicHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const links = [["Home", "/"], ["Company", "/about"], ["Services", "/services"], ["Contact", "/contact"], ["Partner with us", "/partner"]] as const;

  return (
    <header className="relative border-b border-[var(--betanor-border)] bg-[var(--betanor-header-bg)] text-[var(--betanor-header-text)] shadow-[0_1px_0_rgba(18,53,107,0.03)]">
      <nav className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-6 px-6 lg:px-8" aria-label="Primary navigation">
        <Link href="/" aria-label="Betanor home">
          <BetanorMark className="flex items-center gap-3" />
        </Link>
        <div className="hidden items-center gap-6 text-sm font-medium text-[var(--betanor-header-text)]/75 lg:flex">
          {links.map(([label, href]) => <Link className="transition-colors hover:text-[var(--betanor-gold)]" href={href} key={href}>{label}</Link>)}
        </div>
        <div className="hidden items-center gap-2 sm:gap-3 lg:flex"><AuthenticatedProfileButton /></div>
        <button aria-expanded={isOpen} aria-label="Open site navigation" className="grid size-10 place-items-center rounded-lg text-[var(--betanor-header-text)] hover:bg-[var(--betanor-surface)] lg:hidden" onClick={() => setIsOpen(!isOpen)}>☰</button>
      </nav>
      {isOpen && <div className="absolute inset-x-0 top-full z-40 border-b border-[var(--betanor-border)] bg-[var(--betanor-header-bg)] px-6 py-5 shadow-lg lg:hidden"><div className="mx-auto grid max-w-7xl gap-1">{links.map(([label, href]) => <Link className="border-l-2 border-transparent px-3 py-3 text-sm font-semibold text-[var(--betanor-header-text)] hover:border-[var(--betanor-gold)] hover:bg-[var(--betanor-surface)]" href={href} key={href} onClick={() => setIsOpen(false)}>{label}</Link>)}<Link className="border-l-2 border-transparent px-3 py-3 text-sm font-semibold text-[var(--betanor-header-text)] hover:border-[var(--betanor-gold)] hover:bg-[var(--betanor-surface)]" href="/careers" onClick={() => setIsOpen(false)}>Careers</Link><AuthenticatedProfileButton mobile /></div></div>}
    </header>
  );
}
