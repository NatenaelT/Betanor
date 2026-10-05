import Link from "next/link";

import { NotificationInbox } from "@/components/noren/notification-inbox";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export default async function NorenInboxPage() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.hasStaffRole || !access.isActive) return null;
  const canChat = access.permissions.has("chat.manage") || access.permissions.has("chat.internal.read");
  const canSupport = access.permissions.has("support.read") || access.permissions.has("support.view_all");
  return <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--betanor-blue)]">Betanor · Noren</p>
    <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Your inbox</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Messages, assignments and updates addressed to you. Always Welcome, Always Ready.</p></div><div className="flex flex-wrap gap-2">{canChat ? <Link href="/workspace/chats" className="rounded-lg border border-[var(--betanor-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-blue)]">Open conversations</Link> : null}{canSupport ? <Link href="/workspace/support" className="rounded-lg bg-[var(--betanor-navy)] px-4 py-2.5 text-sm font-semibold text-white">Customer support</Link> : null}</div></div>
    <Card className="mt-7 overflow-hidden"><NotificationInbox userId={access.userId} /></Card>
  </main>;
}
