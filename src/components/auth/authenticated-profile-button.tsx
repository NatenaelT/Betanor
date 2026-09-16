"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function AuthenticatedProfileButton({ mobile = false }: { mobile?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => { if (mounted) setEmail(data.user?.email ?? data.user?.phone ?? ""); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (mounted) setEmail(session?.user?.email ?? session?.user?.phone ?? ""); });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  if (!email) return <Link href="/login" onClick={() => setOpen(false)} className={mobile ? "rounded-lg px-3 py-3 text-sm font-semibold text-[var(--betanor-header-text)] hover:bg-[var(--betanor-surface)]" : "rounded-lg border border-[var(--betanor-field-border)] px-3 py-2 text-sm font-semibold text-[var(--betanor-header-text)] transition-colors hover:border-[var(--betanor-field-focus)] hover:text-[var(--betanor-blue)] sm:px-4"}>Sign in / Sign up</Link>;
  const initial = email.slice(0, 1).toUpperCase() || "B";
  // Both destinations are regular in-session links. Supabase cookies stay in
  // place while the server resolves the user's role for the destination; only
  // the explicit Sign out action below clears the session.
  if (mobile) return <div className="mt-1 border-t border-[var(--betanor-border)] pt-2"><button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold text-[var(--betanor-header-text)] hover:bg-[var(--betanor-surface)]"><span className="grid size-8 place-items-center rounded-full bg-[var(--betanor-button-bg)] text-xs font-bold text-[var(--betanor-button-text)]">{initial}</span><span className="truncate">{email}</span></button>{open ? <div className="ml-3 grid gap-1 border-l border-[var(--betanor-border)] pl-3"><Link href="/portal" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-[var(--betanor-header-text)] hover:bg-[var(--betanor-surface)]">Customer portal</Link><Link href="/workspace" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-[var(--betanor-header-text)] hover:bg-[var(--betanor-surface)]">Staff workspace</Link><button type="button" disabled={signingOut} onClick={signOut} className="rounded-lg px-3 py-2 text-left text-sm text-[var(--betanor-header-text)] hover:bg-[var(--betanor-surface)]">{signingOut ? "Signing out…" : "Sign out"}</button></div> : null}</div>;
  return <div className="relative"><button type="button" aria-expanded={open} aria-label="Open profile menu" onClick={() => setOpen((value) => !value)} className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--betanor-field-border)] px-3 text-left hover:bg-[var(--betanor-surface)]"><span className="grid size-7 place-items-center rounded-full bg-[var(--betanor-button-bg)] text-xs font-bold text-[var(--betanor-button-text)]">{initial}</span><span className="hidden max-w-36 truncate text-sm font-semibold text-[var(--betanor-header-text)] sm:block">{email}</span></button>{open ? <div className="absolute top-12 right-0 z-50 w-56 rounded-xl border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] p-2 shadow-xl"><p className="truncate px-3 py-2 text-xs text-[var(--betanor-muted)]">{email}</p><Link href="/portal" onClick={() => setOpen(false)} className="flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[var(--betanor-header-text)] hover:bg-[var(--betanor-surface)]">Customer portal</Link><Link href="/workspace" onClick={() => setOpen(false)} className="flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[var(--betanor-header-text)] hover:bg-[var(--betanor-surface)]">Staff workspace</Link><button type="button" disabled={signingOut} onClick={signOut} className="flex min-h-10 w-full items-center rounded-lg px-3 text-sm font-semibold text-[var(--betanor-header-text)] hover:bg-[var(--betanor-surface)] disabled:opacity-50">{signingOut ? "Signing out…" : "Sign out"}</button></div> : null}</div>;
}
