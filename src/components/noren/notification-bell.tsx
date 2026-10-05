"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { NorenNotification } from "@/lib/noren/notifications";
import { createClient } from "@/lib/supabase/client";

type Item = NorenNotification & { href: string };

export function NotificationBell({ userId, surface = "staff" }: { userId: string; surface?: "staff" | "customer" }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/noren/notifications?limit=6&surface=${surface}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Notifications unavailable");
      const payload = await response.json();
      setItems(payload.items || []);
      setUnreadCount(payload.unreadCount || 0);
      setError(false);
    } catch {
      setError(true);
    }
  }, [surface]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void load(); }, 0);
    const supabase = createClient();
    const channel = supabase.channel(`noren-notifications-${surface}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, () => { void load(); })
      .subscribe();
    return () => { window.clearTimeout(initialLoad); void supabase.removeChannel(channel); };
  }, [load, surface, userId]);

  async function markRead(id: string) {
    const response = await fetch("/api/noren/notifications", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, read: true, surface }),
    });
    if (response.ok) await load();
  }

  return <div className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} className="relative grid size-10 place-items-center rounded-lg text-[var(--betanor-navy)] hover:bg-slate-100">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {unreadCount > 0 ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--betanor-gold)] px-1 text-center text-[10px] font-bold text-[var(--betanor-navy)]">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
    </button>
    {open ? <div className="absolute top-12 right-0 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--betanor-border)] bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-[var(--betanor-border)] px-4 py-3"><div><p className="text-sm font-semibold text-[var(--betanor-navy)]">Noren notifications</p><p className="text-xs text-[var(--betanor-muted)]">{unreadCount} unread</p></div><Link href={surface === "customer" ? "/portal/notifications" : "/workspace/noren/inbox"} onClick={() => setOpen(false)} className="text-xs font-semibold text-[var(--betanor-blue)] hover:underline">View all</Link></div>
      <div className="max-h-80 overflow-y-auto">{error ? <p className="p-4 text-sm text-rose-700">Notifications could not be loaded. Try opening your inbox.</p> : items.length ? items.map((item) => <div key={item.id} className={`border-b border-[var(--betanor-border)] p-3 last:border-b-0 ${item.read_at ? "" : "bg-blue-50/60"}`}><Link href={item.href} onClick={() => { setOpen(false); if (!item.read_at) void markRead(item.id); }} className="block rounded-lg p-1 hover:bg-slate-50"><p className="text-sm font-semibold text-[var(--betanor-navy)]">{item.title}</p>{item.body ? <p className="mt-1 line-clamp-2 text-xs text-[var(--betanor-muted)]">{item.body}</p> : null}<p className="mt-1 text-[11px] text-[var(--betanor-muted)]">{new Date(item.created_at).toLocaleString()}</p></Link></div>) : <p className="p-4 text-sm text-[var(--betanor-muted)]">You&apos;re all caught up.</p>}</div>
    </div> : null}
  </div>;
}
