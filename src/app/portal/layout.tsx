import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { CustomerChatWidget } from "@/components/portal/customer-chat-widget";
import { CustomerPortalNav } from "@/components/portal/customer-portal-nav";
import { CustomerPortalRealtime } from "@/components/portal/customer-portal-realtime";
import { SiteFooter } from "@/components/navigation/site-footer";
import { createClient } from "@/lib/supabase/server";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  if (!userId) redirect("/login?next=/portal");
  const { data: access } = await supabase.from("customer_portal_access").select("customer_id,customers(name,legal_name)").eq("profile_id", userId).eq("is_active", true).limit(1).maybeSingle();
  const [{ data: roleRows }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("roles(code,role_type)").eq("user_id", userId),
    supabase.from("profiles").select("account_type,is_active").eq("id", userId).maybeSingle(),
  ]);
  const isStaff = profile?.is_active !== false && profile?.account_type === "staff" && (roleRows ?? []).some((row) => { const relation = row.roles as unknown as { role_type?: string } | { role_type?: string }[] | null; const role = Array.isArray(relation) ? relation[0] : relation; return role?.role_type === "staff"; });
  const isStaffPreview = !access?.customer_id && isStaff;
  if (!access?.customer_id && !isStaffPreview) redirect("/customer/onboard");
  const customer = Array.isArray(access?.customers) ? access.customers[0] : access?.customers;
  return <div className="min-h-screen bg-[var(--betanor-surface)]"><header className="relative sticky top-0 z-20 border-b border-[var(--betanor-border)] bg-white/95 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-5 py-2 lg:px-8"><Link href="/portal" aria-label="Betanor customer portal"><BetanorMark /></Link><div className="hidden min-w-0 sm:block"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{customer?.name || customer?.legal_name || (isStaffPreview ? "Staff customer preview" : "Customer portal")}</p><p className="text-xs text-[var(--betanor-muted)]">{isStaffPreview ? "Preview mode · no customer records" : "Secure customer workspace"}</p></div><CustomerPortalNav isStaff={isStaff} /></div></header><CustomerPortalRealtime customerId={access?.customer_id} /><CustomerChatWidget customerId={access?.customer_id} />{children}<SiteFooter showRfq={Boolean(access?.customer_id)} /></div>;
}
