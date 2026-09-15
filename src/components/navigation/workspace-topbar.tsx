"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

const quickLinks = [{ href: "/workspace", label: "Workspace overview" }, { href: "/workspace/finance", label: "Finance overview" }, { href: "/workspace/expenses", label: "Expenses" }, { href: "/workspace/invoices", label: "Invoices & payments" }];

export function WorkspaceTopbar({ email }: { email: string }) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-[var(--betanor-border)] bg-white/95 px-5 pl-18 backdrop-blur lg:px-8 lg:pl-8">
    <button type="button" onClick={() => setSearchOpen(true)} className="hidden min-h-10 w-full max-w-md items-center justify-between rounded-lg border border-[var(--betanor-border)] bg-[var(--betanor-surface)] px-3 text-left text-sm text-[var(--betanor-muted)] transition-colors hover:border-[var(--betanor-blue)]"><span>Search workspace</span><kbd className="rounded border border-[var(--betanor-border)] bg-white px-1.5 py-0.5 text-[10px]">⌘ K</kbd></button>
    <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search workspace" className="grid size-10 place-items-center rounded-lg text-lg text-[var(--betanor-navy)] hover:bg-slate-100 sm:hidden">⌕</button>
    <div className="relative flex items-center gap-1 sm:gap-2">
      <button type="button" onClick={() => { setNotificationsOpen((open) => !open); setProfileOpen(false); }} aria-expanded={notificationsOpen} aria-label="Open notifications" className="relative grid size-10 place-items-center rounded-lg text-lg text-[var(--betanor-navy)] hover:bg-slate-100">♢<span className="absolute top-2 right-2 size-1.5 rounded-full bg-[var(--betanor-gold)]" /></button>
      {notificationsOpen ? <div className="absolute top-12 right-12 w-72 rounded-xl border border-[var(--betanor-border)] bg-white p-4 shadow-xl"><p className="text-sm font-semibold text-[var(--betanor-navy)]">Notifications</p><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">You&apos;re all caught up.</p></div> : null}
      <button type="button" onClick={() => { setProfileOpen((open) => !open); setNotificationsOpen(false); }} aria-expanded={profileOpen} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-left hover:bg-slate-100"><span className="grid size-7 place-items-center rounded-full bg-[var(--betanor-navy)] text-xs font-bold text-white">{email.slice(0, 1).toUpperCase() || "B"}</span><span className="hidden max-w-40 truncate text-sm font-medium text-[var(--betanor-navy)] md:block">{email || "Staff account"}</span></button>
      {profileOpen ? <div className="absolute top-12 right-0 w-64 rounded-xl border border-[var(--betanor-border)] bg-white p-2 shadow-xl"><p className="truncate px-3 py-2 text-xs text-[var(--betanor-muted)]">{email}</p><button type="button" disabled={signingOut} onClick={signOut} className="flex w-full min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-100 disabled:opacity-50">{signingOut ? "Signing out…" : "Sign out"}</button></div> : null}
    </div>
    {searchOpen ? <div role="dialog" aria-modal="true" aria-label="Search workspace" className="fixed inset-0 z-50 grid place-items-start bg-[rgba(11,31,58,0.38)] px-4 pt-[18vh]" onMouseDown={() => setSearchOpen(false)}><div className="w-full max-w-xl rounded-xl border border-[var(--betanor-border)] bg-white p-3 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between px-2 pb-3"><p className="text-sm font-semibold text-[var(--betanor-navy)]">Workspace search</p><button type="button" onClick={() => setSearchOpen(false)} className="text-sm text-[var(--betanor-muted)]">Esc</button></div><div className="space-y-1 border-t border-[var(--betanor-border)] pt-2">{quickLinks.map((link) => <Link key={link.href} href={link.href} onClick={() => setSearchOpen(false)} className="flex min-h-11 items-center rounded-lg px-3 text-sm text-[var(--betanor-navy)] hover:bg-slate-100">{link.label}</Link>)}</div></div></div> : null}
  </header>;
}
