"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { NotificationBell } from "@/components/noren/notification-bell";
import { createClient } from "@/lib/supabase/client";

const quickLinks = [{ href: "/workspace", label: "My modules" }, { href: "/workspace/overview", label: "Workspace overview" }, { href: "/workspace/finance", label: "Finance overview" }, { href: "/workspace/expenses", label: "Expenses" }, { href: "/workspace/invoices", label: "Invoices & payments" }];

export function WorkspaceTopbar({ email, displayName, avatarUrl, userId }: { email: string; displayName?: string | null; avatarUrl?: string | null; userId: string }) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return <header className="pwa-safe-top sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-[var(--betanor-border)] bg-[var(--betanor-header-bg)]/95 px-5 pl-18 text-[var(--betanor-header-text)] backdrop-blur lg:px-8 lg:pl-8 print:hidden">
    <button type="button" onClick={() => setSearchOpen(true)} className="hidden min-h-10 w-full max-w-md items-center justify-between rounded-lg border border-[var(--betanor-border)] bg-[var(--betanor-surface)] px-3 text-left text-sm text-[var(--betanor-muted)] transition-colors hover:border-[var(--betanor-blue)]"><span>Search workspace</span><kbd className="rounded border border-[var(--betanor-border)] bg-white px-1.5 py-0.5 text-[10px]">⌘ K</kbd></button>
    <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search workspace" className="grid size-11 place-items-center rounded-lg text-lg text-[var(--betanor-navy)] hover:bg-slate-100 sm:hidden">⌕</button>
    <div className="relative ml-auto flex items-center gap-1 sm:gap-2">
      <NotificationBell userId={userId} />
      <button type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-left hover:bg-slate-100">{avatarUrl ? <img src={avatarUrl} alt="" className="size-7 rounded-full object-cover" /> : <span className="grid size-7 place-items-center rounded-full bg-[var(--betanor-navy)] text-xs font-bold text-white">{(displayName || email).slice(0, 1).toUpperCase() || "B"}</span>}<span className="hidden max-w-40 truncate text-sm font-medium text-[var(--betanor-navy)] md:block">{displayName || email || "Staff account"}</span></button>
      {profileOpen ? <div className="absolute top-12 right-0 w-64 rounded-xl border border-[var(--betanor-border)] bg-white p-2 shadow-xl"><p className="truncate px-3 py-2 text-xs text-[var(--betanor-muted)]">{email}</p><Link href="/workspace/profile" className="flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-100">My profile</Link><Link href="/portal" className="flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-100">Open customer portal</Link><button type="button" disabled={signingOut} onClick={signOut} className="flex w-full min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-100 disabled:opacity-50">{signingOut ? "Signing out…" : "Sign out"}</button></div> : null}
    </div>
    {searchOpen ? <div role="dialog" aria-modal="true" aria-label="Search workspace" className="fixed inset-0 z-50 grid place-items-start bg-[rgba(11,31,58,0.38)] px-4 pt-[18vh]" onMouseDown={() => setSearchOpen(false)}><div className="w-full max-w-xl rounded-xl border border-[var(--betanor-border)] bg-white p-3 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between px-2 pb-3"><p className="text-sm font-semibold text-[var(--betanor-navy)]">Workspace search</p><button type="button" onClick={() => setSearchOpen(false)} className="text-sm text-[var(--betanor-muted)]">Esc</button></div><div className="space-y-1 border-t border-[var(--betanor-border)] pt-2">{quickLinks.map((link) => <Link key={link.href} href={link.href} onClick={() => setSearchOpen(false)} className="flex min-h-11 items-center rounded-lg px-3 text-sm text-[var(--betanor-navy)] hover:bg-slate-100">{link.label}</Link>)}</div></div></div> : null}
  </header>;
}
