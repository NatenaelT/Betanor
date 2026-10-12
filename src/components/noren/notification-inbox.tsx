"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { notificationPreview, type NorenNotification } from "@/lib/noren/notifications";
import { createClient } from "@/lib/supabase/client";

type Item = NorenNotification & { href: string };
type Filter = "all" | "unread" | "assigned";

export function NotificationInbox({ userId, surface = "staff" }: { userId: string; surface?: "staff" | "customer" }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [working, setWorking] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/noren/notifications?filter=${filter}&page=${page}&limit=20&surface=${surface}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Notifications unavailable");
      const payload = await response.json();
      setItems(payload.items || []);
      setTotal(payload.total || 0);
      setUnreadCount(payload.unreadCount || 0);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filter, page, surface]);

  useEffect(() => { const initialLoad = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(initialLoad); }, [load]);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`noren-inbox-${surface}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, surface, userId]);

  async function setRead(id: string, read: boolean) {
    const response = await fetch("/api/noren/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, read, surface }) });
    if (response.ok) await load();
    else setActionMessage("That notification could not be updated. Please retry.");
  }

  async function markAllRead() {
    setWorking(true); setActionMessage("");
    try {
      const response = await fetch("/api/noren/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read_all", surface }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Notifications could not be marked as read.");
      setActionMessage(payload.updated ? `${payload.updated} notifications marked as read.` : "There are no unread notifications.");
      await load();
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "Notifications could not be marked as read.");
    } finally { setWorking(false); }
  }

  async function clearAll() {
    setWorking(true); setActionMessage("");
    try {
      const response = await fetch("/api/noren/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ surface }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Notifications could not be cleared.");
      setConfirmClear(false); setPage(1); setFilter("all");
      setActionMessage(payload.deleted ? `${payload.deleted} notifications cleared.` : "There are no notifications to clear.");
      await load();
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "Notifications could not be cleared.");
    } finally { setWorking(false); }
  }

  const filters: { code: Filter; label: string }[] = [{ code: "all", label: "All" }, { code: "unread", label: `Unread (${unreadCount})` }, ...(surface === "staff" ? [{ code: "assigned" as const, label: "Assigned to me" }] : [])];
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--betanor-border)] p-4"><div className="flex flex-wrap gap-2">{filters.map((option) => <button key={option.code} type="button" onClick={() => { setLoading(true); setPage(1); setFilter(option.code); }} aria-pressed={filter === option.code} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${filter === option.code ? "bg-[var(--betanor-navy)] text-white" : "bg-slate-100 text-[var(--betanor-navy)] hover:bg-blue-50"}`}>{option.label}</button>)}</div><div className="flex flex-wrap gap-2"><button type="button" disabled={working || unreadCount === 0} onClick={() => void markAllRead()} className="min-h-9 rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold text-[var(--betanor-navy)] disabled:opacity-50">Mark all read</button><button type="button" disabled={working || total === 0} onClick={() => setConfirmClear(true)} className="min-h-9 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Clear notifications</button></div></div>
    {actionMessage ? <p role="status" className="border-b border-[var(--betanor-border)] px-4 py-2 text-xs text-[var(--betanor-muted)]">{actionMessage}</p> : null}
    {error ? <div className="p-6 text-sm text-rose-700">Notifications could not be loaded. <button type="button" onClick={() => void load()} className="font-semibold underline">Try again</button></div> : loading ? <p className="p-6 text-sm text-[var(--betanor-muted)]">Loading your inbox…</p> : items.length ? <ul className="divide-y divide-[var(--betanor-border)]">{items.map((item) => <li key={item.id} className={`flex items-start gap-3 p-4 sm:p-5 ${item.read_at ? "" : "bg-blue-50/60"}`}><span className={`mt-2 size-2 shrink-0 rounded-full ${item.read_at ? "bg-slate-200" : "bg-[var(--betanor-gold)]"}`} /><div className="min-w-0 flex-1"><Link href={item.href} onClick={() => { if (!item.read_at) void setRead(item.id, true); }} className="font-semibold text-[var(--betanor-navy)] hover:text-[var(--betanor-blue)]">{item.title}</Link>{item.body ? <p className="mt-1 text-sm leading-6 text-[var(--betanor-muted)]">{notificationPreview(item.body)}</p> : null}<div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--betanor-muted)]"><span>{new Date(item.created_at).toLocaleString()}</span><span>{item.type.replaceAll("_", " ").replaceAll(".", " ")}</span></div></div><button type="button" onClick={() => void setRead(item.id, !Boolean(item.read_at))} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--betanor-blue)] hover:bg-blue-50">{item.read_at ? "Mark unread" : "Mark read"}</button></li>)}</ul> : <p className="p-8 text-center text-sm text-[var(--betanor-muted)]">No notifications in this view.</p>}
    {confirmClear ? <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/40 p-4" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby="clear-notifications-title" className="w-full max-w-sm rounded-2xl border border-[var(--betanor-border)] bg-white p-5 shadow-2xl"><h2 id="clear-notifications-title" className="text-base font-semibold text-[var(--betanor-navy)]">Clear all notifications?</h2><p className="mt-2 text-sm text-[var(--betanor-muted)]">This removes notifications from your inbox. It does not delete the tasks, messages, or other records they link to.</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={working} onClick={() => setConfirmClear(false)} className="min-h-10 rounded-lg border border-[var(--betanor-border)] px-4 text-sm font-semibold">Cancel</button><button type="button" disabled={working} onClick={() => void clearAll()} className="min-h-10 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{working ? "Clearing…" : "Clear all"}</button></div></section></div> : null}
    {total > 20 ? <div className="flex items-center justify-between border-t border-[var(--betanor-border)] p-4 text-xs text-[var(--betanor-muted)]"><span>Page {page} of {Math.ceil(total / 20)}</span><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 disabled:opacity-40">Previous</button><button type="button" disabled={page * 20 >= total} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 disabled:opacity-40">Next</button></div></div> : null}
  </div>;
}
