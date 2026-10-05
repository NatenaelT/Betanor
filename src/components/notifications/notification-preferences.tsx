"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Channel = "in_app" | "email" | "telegram";
type EventSettings = Record<string, Partial<Record<Channel, boolean>>>;
const categories = [
  { key: "chat", label: "Chats and messages", help: "Customer replies and internal conversations" },
  { key: "support", label: "Support", help: "Tickets, appointments and SLA updates" },
  { key: "work", label: "Tasks and projects", help: "Assignments and work updates" },
  { key: "tenders", label: "Tenders", help: "Deadlines and proposal activity" },
  { key: "documents", label: "Letters and documents", help: "Correspondence and document updates" },
  { key: "finance", label: "Finance and payroll", help: "Financial and payslip updates" },
  { key: "general", label: "Other alerts", help: "All remaining system notifications" },
] as const;
const channels: { key: Channel; label: string }[] = [{ key: "in_app", label: "In app" }, { key: "email", label: "Email" }, { key: "telegram", label: "Telegram" }];

export function NotificationPreferences({ profileId, initialChannels, initialEvents }: {
  profileId: string;
  initialChannels: Record<Channel, boolean>;
  initialEvents: EventSettings;
}) {
  const [master, setMaster] = useState(initialChannels);
  const [events, setEvents] = useState<EventSettings>(initialEvents);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function save(nextMaster: Record<Channel, boolean>, nextEvents: EventSettings) {
    setSaving(true); setFeedback("");
    const supabase = createClient();
    const { error } = await supabase.from("support_notification_preferences").upsert({
      profile_id: profileId, ...nextMaster, event_settings: nextEvents,
    }, { onConflict: "profile_id" });
    setSaving(false);
    setFeedback(error ? error.message : "Preferences saved.");
  }

  return <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--betanor-border)] bg-white p-5 sm:p-6" aria-labelledby="notification-preferences-title">
    <h2 id="notification-preferences-title" className="text-lg font-semibold text-[var(--betanor-navy)]">Notification preferences</h2>
    <p className="mt-1 text-sm text-[var(--betanor-muted)]">Choose your channels, then mute individual types of activity. Changes affect your account only.</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">{channels.map(({ key, label }) => <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--betanor-border)] px-3 text-sm"><input type="checkbox" checked={master[key]} disabled={saving} onChange={(event) => { const next = { ...master, [key]: event.target.checked }; setMaster(next); void save(next, events); }} className="size-4 accent-[var(--betanor-blue)]"/><span>{label}</span></label>)}</div>
    <p className="mt-2 text-xs text-[var(--betanor-muted)]">Email applies to events with email delivery configured; Telegram requires a linked account. Channel switches are master controls.</p>
    <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--betanor-border)]"><table className="w-full min-w-[520px] text-sm"><thead className="bg-slate-50 text-xs text-[var(--betanor-muted)]"><tr><th className="px-3 py-3 text-left font-semibold">Activity</th>{channels.map(({ key, label }) => <th key={key} className="px-3 py-3 text-center font-semibold">{label}</th>)}</tr></thead><tbody>{categories.map(({ key, label, help }) => <tr key={key} className="border-t border-[var(--betanor-border)]"><th scope="row" className="px-3 py-3 text-left font-medium text-[var(--betanor-navy)]">{label}<span className="block text-xs font-normal text-[var(--betanor-muted)]">{help}</span></th>{channels.map(({ key: channel }) => <td key={channel} className="px-3 py-3 text-center"><input type="checkbox" aria-label={`${label} by ${channel}`} checked={events[key]?.[channel] !== false} disabled={saving || !master[channel]} onChange={(event) => { const next = { ...events, [key]: { ...events[key], [channel]: event.target.checked } }; setEvents(next); void save(master, next); }} className="size-4 accent-[var(--betanor-blue)]"/></td>)}</tr>)}</tbody></table></div>
    {feedback ? <p role="status" className={`mt-3 text-xs ${feedback === "Preferences saved." ? "text-emerald-700" : "text-rose-700"}`}>{feedback}</p> : null}
  </section>;
}
