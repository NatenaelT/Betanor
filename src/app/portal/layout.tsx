import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { CustomerChatWidget } from "@/components/portal/customer-chat-widget";
import { CustomerPortalRealtime } from "@/components/portal/customer-portal-realtime";
import { SiteFooter } from "@/components/navigation/site-footer";
import { createClient } from "@/lib/supabase/server";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  if (!userId) redirect("/customer/login?next=/portal");
  const { data: access } = await supabase.from("customer_portal_access").select("customer_id,customers(name,legal_name)").eq("profile_id", userId).eq("is_active", true).limit(1).maybeSingle();
  const { data: roleRows } = await supabase.from("user_roles").select("roles(code)").eq("user_id", userId);
  const roleCodes = (roleRows ?? []).map((row) => { const relation = row.roles as unknown as { code?: string } | { code?: string }[] | null; return Array.isArray(relation) ? relation[0]?.code : relation?.code; }).filter((code): code is string => Boolean(code));
  const isStaff = roleCodes.length > 0;
  const isStaffPreview = !access?.customer_id && isStaff;
  if (!access?.customer_id && !isStaffPreview) redirect("/customer/onboard");
  const customer = Array.isArray(access?.customers) ? access.customers[0] : access?.customers;
  return <div className="min-h-screen bg-[var(--betanor-surface)]"><header className="sticky top-0 z-20 border-b border-[var(--betanor-border)] bg-white/95 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-4 px-5 py-2 lg:px-8"><Link href="/portal" aria-label="Betanor customer portal"><BetanorMark /></Link><div className="hidden min-w-0 sm:block"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{customer?.name || customer?.legal_name || (isStaffPreview ? "Staff customer preview" : "Customer portal")}</p><p className="text-xs text-[var(--betanor-muted)]">{isStaffPreview ? "Preview mode · no customer records" : "Secure customer workspace"}</p></div><nav className="order-3 flex w-full items-center gap-1 overflow-x-auto text-sm font-semibold text-[var(--betanor-navy)] sm:order-none sm:ml-auto sm:w-auto"><Link href="/" className="rounded-lg px-2.5 py-2 hover:bg-slate-100">Home</Link><Link href="/about" className="rounded-lg px-2.5 py-2 hover:bg-slate-100">Company</Link><Link href="/services" className="rounded-lg px-2.5 py-2 hover:bg-slate-100">Services</Link><Link href="/contact" className="rounded-lg px-2.5 py-2 hover:bg-slate-100">Contact</Link><Link href="/partner" className="rounded-lg px-2.5 py-2 hover:bg-slate-100">Partner</Link><Link href="/portal" className="rounded-lg bg-blue-50 px-2.5 py-2 text-[var(--betanor-blue)]">Overview</Link>{isStaff ? <Link href="/workspace" className="rounded-lg px-2.5 py-2 text-[var(--betanor-blue)] hover:bg-slate-100">Back to staff workspace</Link> : null}<form action="/auth/signout" method="post"><button className="rounded-lg px-2.5 py-2 text-[var(--betanor-blue)] hover:bg-slate-100" type="submit">Sign out</button></form></nav></div></header><CustomerPortalRealtime customerId={access?.customer_id} /><CustomerChatWidget customerId={access?.customer_id} />{children}<SiteFooter showRfq={Boolean(access?.customer_id)} /></div>;
}
