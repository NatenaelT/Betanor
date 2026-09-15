import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { createClient } from "@/lib/supabase/server";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  if (!userId) redirect("/login?next=/portal");
  const { data: access } = await supabase.from("customer_portal_access").select("customer_id,customers(name,legal_name)").eq("profile_id", userId).eq("is_active", true).limit(1).maybeSingle();
  if (!access?.customer_id) redirect("/login?next=/portal");
  const customer = Array.isArray(access.customers) ? access.customers[0] : access.customers;
  return <div className="min-h-screen bg-[var(--betanor-surface)]"><header className="sticky top-0 z-20 border-b border-[var(--betanor-border)] bg-white/95 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-7xl items-center gap-5 px-5 lg:px-8"><Link href="/portal" aria-label="Betanor customer portal"><BetanorMark /></Link><div className="hidden min-w-0 sm:block"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{customer?.name || customer?.legal_name || "Customer portal"}</p><p className="text-xs text-[var(--betanor-muted)]">Secure customer workspace</p></div><nav className="ml-auto flex items-center gap-1 text-sm font-semibold text-[var(--betanor-navy)]"><Link href="/portal" className="rounded-lg px-3 py-2 hover:bg-slate-100">Overview</Link><Link href="/rfq" className="rounded-lg px-3 py-2 hover:bg-slate-100">New RFQ</Link><form action="/auth/signout" method="post"><button className="rounded-lg px-3 py-2 text-[var(--betanor-blue)] hover:bg-slate-100" type="submit">Sign out</button></form></nav></div></header>{children}</div>;
}
