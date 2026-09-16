"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AuthenticatedProfileButton } from "@/components/auth/authenticated-profile-button";
import { cn } from "@/lib/utils";

const links = [["Dashboard", "/portal"], ["Company", "/about"], ["Services", "/services"], ["Contact", "/contact"], ["Partner", "/partner"]] as const;

export function CustomerPortalNav({ isStaff }: { isStaff: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-expanded={open} aria-label="Open customer portal menu" onClick={() => setOpen((value) => !value)} className="ml-auto grid size-10 place-items-center rounded-lg border border-[var(--betanor-border)] text-lg text-[var(--betanor-navy)] hover:bg-slate-50 lg:hidden">☰</button>
    <nav aria-label="Customer portal navigation" className="hidden items-center gap-1 text-sm font-semibold text-[var(--betanor-navy)] lg:flex">
      {links.map(([label, href]) => <Link key={href} href={href} className={cn("rounded-lg px-3 py-2 transition-colors hover:bg-slate-50", pathname === href ? "bg-blue-50 text-[var(--betanor-blue)]" : "")}>{label}</Link>)}
      <Link href="/rfq" className="ml-1 rounded-lg bg-[var(--betanor-navy)] px-3 py-2 text-white hover:bg-[var(--betanor-blue)]">New RFQ</Link>
      {isStaff ? <Link href="/workspace" className="rounded-lg px-3 py-2 text-[var(--betanor-blue)] hover:bg-slate-50">Staff workspace</Link> : null}
      <AuthenticatedProfileButton />
    </nav>
    {open ? <div className="absolute inset-x-0 top-full z-40 border-b border-[var(--betanor-border)] bg-white p-4 shadow-xl lg:hidden"><div className="grid gap-1">{links.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("rounded-lg px-3 py-3 text-sm font-semibold", pathname === href ? "bg-blue-50 text-[var(--betanor-blue)]" : "text-[var(--betanor-navy)] hover:bg-slate-50")}>{label}</Link>)}<Link href="/rfq" onClick={() => setOpen(false)} className="mt-1 rounded-lg bg-[var(--betanor-navy)] px-3 py-3 text-sm font-semibold text-white">Request a quotation</Link>{isStaff ? <Link href="/workspace" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-[var(--betanor-blue)] hover:bg-slate-50">Back to staff workspace</Link> : null}<AuthenticatedProfileButton mobile /></div></div> : null}
  </>;
}
