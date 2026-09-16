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

  if (!email) return <Link href="/login" onClick={() => setOpen(false)} className={mobile ? "rounded-lg px-3 py-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-50" : "rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm font-semibold text-[var(--betanor-navy)] transition-colors hover:border-[var(--betanor-blue)] hover:text-[var(--betanor-blue)] sm:px-4"}>Sign in / Sign up</Link>;
  const initial = email.slice(0, 1).toUpperCase() || "B";
  if (mobile) return <div className="mt-1 border-t border-[var(--betanor-border)] pt-2"><button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-50"><span className="grid size-8 place-items-center rounded-full bg-[var(--betanor-navy)] text-xs font-bold text-white">{initial}</span><span className="truncate">{email}</span></button>{open ? <div className="ml-3 grid gap-1 border-l border-[var(--betanor-border)] pl-3"><Link href="/portal" className="rounded-lg px-3 py-2 text-sm text-[var(--betanor-navy)] hover:bg-slate-50">Customer portal</Link><Link href="/login?next=/workspace" className="rounded-lg px-3 py-2 text-sm text-[var(--betanor-navy)] hover:bg-slate-50">Staff workspace</Link><button type="button" disabled={signingOut} onClick={signOut} className="rounded-lg px-3 py-2 text-left text-sm text-[var(--betanor-navy)] hover:bg-slate-50">{signingOut ? "Signing out…" : "Sign out"}</button></div> : null}</div>;
  return <div className="relative"><button type="button" aria-expanded={open} aria-label="Open profile menu" onClick={() => setOpen((value) => !value)} className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--betanor-border)] px-3 text-left hover:bg-slate-50"><span className="grid size-7 place-items-center rounded-full bg-[var(--betanor-navy)] text-xs font-bold text-white">{initial}</span><span className="hidden max-w-36 truncate text-sm font-semibold text-[var(--betanor-navy)] sm:block">{email}</span></button>{open ? <div className="absolute top-12 right-0 z-50 w-56 rounded-xl border border-[var(--betanor-border)] bg-white p-2 shadow-xl"><p className="truncate px-3 py-2 text-xs text-[var(--betanor-muted)]">{email}</p><Link href="/portal" className="flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-100">Customer portal</Link><Link href="/login?next=/workspace" className="flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-100">Staff workspace</Link><button type="button" disabled={signingOut} onClick={signOut} className="flex min-h-10 w-full items-center rounded-lg px-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-100 disabled:opacity-50">{signingOut ? "Signing out…" : "Sign out"}</button></div> : null}</div>;
}
