"use client";

import Link from "next/link";
import { useState } from "react";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { AuthenticatedProfileButton } from "@/components/auth/authenticated-profile-button";

type HeaderLink = { id: string; label: string; href: string };

export function PublicHeaderClient({ links }: { links: HeaderLink[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="pwa-safe-top relative border-b border-[var(--betanor-border)] bg-[var(--betanor-header-bg)] text-[var(--betanor-header-text)] shadow-[0_1px_0_rgba(18,53,107,0.03)]">
      <nav className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-6 px-6 lg:px-8" aria-label="Primary navigation">
        <Link href="/" aria-label="Betanor home"><BetanorMark className="flex items-center gap-3" /></Link>
        <div className="hidden items-center gap-6 text-sm font-medium text-[var(--betanor-header-text)]/75 lg:flex">
          {links.map((link) => <Link className="transition-colors hover:text-[var(--betanor-gold)]" href={link.href} key={link.id}>{link.label}</Link>)}
        </div>
        <div className="hidden items-center gap-2 sm:gap-3 lg:flex"><AuthenticatedProfileButton /></div>
        <button type="button" aria-expanded={isOpen} aria-controls="public-mobile-navigation" aria-label={isOpen ? "Close site navigation" : "Open site navigation"} className="grid size-11 place-items-center rounded-lg text-[var(--betanor-header-text)] hover:bg-[var(--betanor-surface)] lg:hidden" onClick={() => setIsOpen((value) => !value)}>☰</button>
      </nav>
      {isOpen ? <div id="public-mobile-navigation" className="absolute inset-x-0 top-full z-40 border-b border-[var(--betanor-border)] bg-[var(--betanor-header-bg)] px-6 py-5 shadow-lg lg:hidden"><div className="mx-auto grid max-w-7xl gap-1">{links.map((link) => <Link className="border-l-2 border-transparent px-3 py-3 text-sm font-semibold text-[var(--betanor-header-text)] hover:border-[var(--betanor-gold)] hover:bg-[var(--betanor-surface)]" href={link.href} key={link.id} onClick={() => setIsOpen(false)}>{link.label}</Link>)}<AuthenticatedProfileButton mobile /></div></div> : null}
    </header>
  );
}
