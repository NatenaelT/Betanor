import Link from "next/link";

import { NotificationInbox } from "@/components/noren/notification-inbox";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CustomerNotificationsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  if (!userId) return null;
  const { data: access } = await supabase.from("customer_portal_access")
    .select("customer_id").eq("profile_id", userId).eq("is_active", true).limit(1).maybeSingle();
  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--betanor-blue)]">Noren support</p><h1 className="mt-2 text-3xl font-semibold text-[var(--betanor-navy)]">Your notifications</h1><p className="mt-2 text-sm text-[var(--betanor-muted)]">Updates about support requests and conversations for your account.</p>{access?.customer_id ? <Card className="mt-7 overflow-hidden"><NotificationInbox userId={userId} surface="customer" /></Card> : <Card className="mt-7 p-6"><p className="text-sm text-[var(--betanor-muted)]">Connect a customer account to see customer support notifications.</p><Link href="/portal" className="mt-3 inline-block text-sm font-semibold text-[var(--betanor-blue)]">Back to customer portal →</Link></Card>}</main>;
}
