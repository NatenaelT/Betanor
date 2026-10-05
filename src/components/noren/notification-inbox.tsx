"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { NorenNotification } from "@/lib/noren/notifications";
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
  }

  const filters: { code: Filter; label: string }[] = [{ code: "all", label: "All" }, { code: "unread", label: `Unread (${unreadCount})` }, ...(surface === "staff" ? [{ code: "assigned" as const, label: "Assigned to me" }] : [])];
  return <div>
    <div className="flex flex-wrap gap-2 border-b border-[var(--betanor-border)] p-4">{filters.map((option) => <button key={option.code} type="button" onClick={() => { setLoading(true); setPage(1); setFilter(option.code); }} aria-pressed={filter === option.code} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${filter === option.code ? "bg-[var(--betanor-navy)] text-white" : "bg-slate-100 text-[var(--betanor-navy)] hover:bg-blue-50"}`}>{option.label}</button>)}</div>
    {error ? <div className="p-6 text-sm text-rose-700">Notifications could not be loaded. <button type="button" onClick={() => void load()} className="font-semibold underline">Try again</button></div> : loading ? <p className="p-6 text-sm text-[var(--betanor-muted)]">Loading your inbox…</p> : items.length ? <ul className="divide-y divide-[var(--betanor-border)]">{items.map((item) => <li key={item.id} className={`flex items-start gap-3 p-4 sm:p-5 ${item.read_at ? "" : "bg-blue-50/60"}`}><span className={`mt-2 size-2 shrink-0 rounded-full ${item.read_at ? "bg-slate-200" : "bg-[var(--betanor-gold)]"}`} /><div className="min-w-0 flex-1"><Link href={item.href} onClick={() => { if (!item.read_at) void setRead(item.id, true); }} className="font-semibold text-[var(--betanor-navy)] hover:text-[var(--betanor-blue)]">{item.title}</Link>{item.body ? <p className="mt-1 text-sm leading-6 text-[var(--betanor-muted)]">{item.body}</p> : null}<div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--betanor-muted)]"><span>{new Date(item.created_at).toLocaleString()}</span><span>{item.type.replaceAll("_", " ").replaceAll(".", " ")}</span></div></div><button type="button" onClick={() => void setRead(item.id, !Boolean(item.read_at))} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--betanor-blue)] hover:bg-blue-50">{item.read_at ? "Mark unread" : "Mark read"}</button></li>)}</ul> : <p className="p-8 text-center text-sm text-[var(--betanor-muted)]">No notifications in this view.</p>}
    {total > 20 ? <div className="flex items-center justify-between border-t border-[var(--betanor-border)] p-4 text-xs text-[var(--betanor-muted)]"><span>Page {page} of {Math.ceil(total / 20)}</span><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 disabled:opacity-40">Previous</button><button type="button" disabled={page * 20 >= total} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 disabled:opacity-40">Next</button></div></div> : null}
  </div>;
}
