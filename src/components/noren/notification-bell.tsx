"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { notificationPreview, type NorenNotification } from "@/lib/noren/notifications";
import { createClient } from "@/lib/supabase/client";

type Item = NorenNotification & { href: string };

export function NotificationBell({ userId, surface = "staff" }: { userId: string; surface?: "staff" | "customer" }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState(false);
  const [working, setWorking] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/noren/notifications?limit=6&surface=${surface}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Notifications unavailable");
      const payload = await response.json();
      setItems(payload.items || []);
      setUnreadCount(payload.unreadCount || 0);
      setTotalCount(payload.total || 0);
      setError(false);
    } catch {
      setError(true);
    }
  }, [surface]);

  useEffect(() => {
    let hasLoaded = false;
    const initialLoad = window.setTimeout(() => { hasLoaded = true; void load(); }, 0);
    const supabase = createClient();
    const channel = supabase.channel(`noren-notifications-${surface}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, () => { void load(); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (!hasLoaded) { hasLoaded = true; void load(); }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          hasLoaded = false;
        }
      });
    return () => { window.clearTimeout(initialLoad); void supabase.removeChannel(channel); };
  }, [load, surface, userId]);

  useEffect(() => {
    if (!open) return;
    function closeIfOutside(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function markRead(id: string) {
    const response = await fetch("/api/noren/notifications", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, read: true, surface }),
    });
    if (response.ok) await load();
  }

  async function markAllRead() {
    setWorking(true); setActionMessage("");
    try {
      const response = await fetch("/api/noren/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read_all", surface }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not mark notifications as read.");
      setActionMessage(payload.updated ? `${payload.updated} marked as read.` : "No unread notifications.");
      await load();
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "Could not mark notifications as read.");
    } finally { setWorking(false); }
  }

  async function clearAll() {
    setWorking(true); setActionMessage("");
    try {
      const response = await fetch("/api/noren/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ surface }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not clear notifications.");
      setConfirmClear(false);
      setActionMessage(payload.deleted ? `${payload.deleted} notifications cleared.` : "No notifications to clear.");
      await load();
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "Could not clear notifications.");
    } finally { setWorking(false); }
  }

  return <div ref={rootRef} className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-controls={`notification-panel-${surface}`} aria-expanded={open} aria-haspopup="dialog" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} className="relative grid size-10 place-items-center rounded-lg text-[var(--betanor-navy)] hover:bg-slate-100">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {unreadCount > 0 ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--betanor-gold)] px-1 text-center text-[10px] font-bold text-[var(--betanor-navy)]">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
    </button>
    {open ? <div id={`notification-panel-${surface}`} role="dialog" aria-label="Notifications" className="fixed inset-x-2 top-[calc(env(safe-area-inset-top)+4.25rem)] z-50 w-auto overflow-hidden rounded-xl border border-[var(--betanor-border)] bg-white shadow-2xl sm:absolute sm:inset-auto sm:top-12 sm:right-0 sm:w-[min(24rem,calc(100vw-2rem))]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--betanor-border)] px-4 py-3"><div><p className="text-sm font-semibold text-[var(--betanor-navy)]">Noren notifications</p><p className="text-xs text-[var(--betanor-muted)]">{unreadCount} unread</p></div><div className="flex items-center gap-3"><Link href={surface === "customer" ? "/portal/notifications" : "/workspace/noren/inbox"} onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center text-xs font-semibold text-[var(--betanor-blue)] hover:underline">View all</Link><button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="grid size-9 place-items-center rounded-lg text-[var(--betanor-muted)] hover:bg-slate-100">×</button></div></div>
      <div className="flex flex-wrap gap-2 border-b border-[var(--betanor-border)] px-3 py-2"><button type="button" disabled={working || unreadCount === 0} onClick={() => void markAllRead()} className="min-h-8 rounded-md px-2 text-[11px] font-semibold text-[var(--betanor-blue)] hover:bg-blue-50 disabled:opacity-40">Mark all read</button><button type="button" disabled={working || totalCount === 0} onClick={() => setConfirmClear(true)} className="min-h-8 rounded-md px-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40">Clear notifications</button>{actionMessage ? <span role="status" className="self-center text-[10px] text-[var(--betanor-muted)]">{actionMessage}</span> : null}</div>
      <div className="max-h-[min(65dvh,28rem)] overflow-y-auto overscroll-contain sm:max-h-96">{error ? <p className="p-4 text-sm text-rose-700">Notifications could not be loaded. Try opening your inbox.</p> : items.length ? items.map((item) => <div key={item.id} className={`border-b border-[var(--betanor-border)] p-3 last:border-b-0 ${item.read_at ? "" : "bg-blue-50/60"}`}><Link href={item.href} onClick={() => { setOpen(false); if (!item.read_at) void markRead(item.id); }} className="block min-h-14 rounded-lg p-2 hover:bg-slate-50"><p className="text-sm font-semibold text-[var(--betanor-navy)]">{item.title}</p>{item.body ? <p className="mt-1 text-xs leading-5 text-[var(--betanor-muted)]">{notificationPreview(item.body)}</p> : null}<p className="mt-1 text-[11px] text-[var(--betanor-muted)]">{new Date(item.created_at).toLocaleString()}</p></Link></div>) : <p className="p-4 text-sm text-[var(--betanor-muted)]">You&apos;re all caught up.</p>}</div>
      {confirmClear ? <div className="absolute inset-0 z-10 grid place-items-center bg-white/95 p-4 backdrop-blur-sm"><section role="alertdialog" aria-modal="true" aria-labelledby="bell-clear-notifications-title" className="w-full rounded-xl border border-[var(--betanor-border)] bg-white p-4 shadow-xl"><h2 id="bell-clear-notifications-title" className="text-sm font-semibold text-[var(--betanor-navy)]">Clear all notifications?</h2><p className="mt-2 text-xs leading-5 text-[var(--betanor-muted)]">This only clears your notification inbox, not the linked records.</p><div className="mt-4 flex justify-end gap-2"><button type="button" disabled={working} onClick={() => setConfirmClear(false)} className="min-h-9 rounded-lg border border-[var(--betanor-border)] px-3 text-xs font-semibold">Cancel</button><button type="button" disabled={working} onClick={() => void clearAll()} className="min-h-9 rounded-lg bg-rose-700 px-3 text-xs font-semibold text-white disabled:opacity-50">{working ? "Clearing…" : "Clear all"}</button></div></section></div> : null}
    </div> : null}
  </div>;
}
