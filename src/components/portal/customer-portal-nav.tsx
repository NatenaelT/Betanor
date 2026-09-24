"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AuthenticatedProfileButton } from "@/components/auth/authenticated-profile-button";
import { cn } from "@/lib/utils";

const links = [["Dashboard", "/portal"], ["IT Support", "/portal/support"], ["Company", "/about"], ["Services", "/services"], ["Contact", "/contact"], ["Partner", "/partner"], ["Help & support", "/portal/help"]] as const;

export function CustomerPortalNav({ isStaff }: { isStaff: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-expanded={open} aria-label="Open customer portal menu" onClick={() => setOpen((value) => !value)} className="ml-auto grid size-10 place-items-center rounded-lg border border-[var(--betanor-field-border)] text-lg text-[var(--betanor-header-text)] hover:bg-[var(--betanor-surface)] lg:hidden">☰</button>
    <nav aria-label="Customer portal navigation" className="hidden items-center gap-1 text-sm font-semibold text-[var(--betanor-navy)] lg:flex">
      {links.map(([label, href]) => <Link key={href} href={href} className={cn("border-b-2 border-transparent px-3 py-2 transition-colors hover:border-[var(--betanor-gold)] hover:text-[var(--betanor-navy)]", pathname === href ? "border-[var(--betanor-gold)] text-[var(--betanor-navy)]" : "")}>{label}</Link>)}
      {isStaff ? <Link href="/workspace" className="border-b-2 border-transparent px-3 py-2 text-[var(--betanor-blue)] hover:border-[var(--betanor-gold)]">Staff workspace</Link> : null}
      <AuthenticatedProfileButton />
    </nav>
    {open ? <div className="absolute inset-x-0 top-full z-40 border-b border-[var(--betanor-border)] bg-[var(--betanor-header-bg)] p-4 shadow-xl lg:hidden"><div className="grid gap-1">{links.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("border-l-2 border-transparent px-3 py-3 text-sm font-semibold", pathname === href ? "border-[var(--betanor-gold)] text-[var(--betanor-navy)]" : "text-[var(--betanor-header-text)] hover:border-[var(--betanor-gold)] hover:bg-[var(--betanor-surface)]")}>{label}</Link>)}{isStaff ? <Link href="/workspace" onClick={() => setOpen(false)} className="border-l-2 border-transparent px-3 py-3 text-sm font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-gold)] hover:bg-[var(--betanor-surface)]">Back to staff workspace</Link> : null}<AuthenticatedProfileButton mobile /></div></div> : null}
  </>;
}
