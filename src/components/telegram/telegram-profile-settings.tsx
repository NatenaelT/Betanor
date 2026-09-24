"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

type Connection = { telegram_username: string | null; linked_at: string } | null;

async function edgeErrorMessage(error: Error & { context?: unknown }, data: unknown) {
  const response = error.context;
  const body = data && typeof data === "object" ? data as { error?: unknown } : null;
  if (typeof body?.error === "string") return body.error;
  if (response instanceof Response) {
    const result = await response.clone().json().catch(() => null) as { error?: unknown } | null;
    if (typeof result?.error === "string") return result.error;
  }
  return error.message;
}

export function TelegramProfileSettings({ profileId, initialConnection, initialEnabled }: {
  profileId: string;
  initialConnection: Connection;
  initialEnabled: boolean;
}) {
  const [connection, setConnection] = useState<Connection>(initialConnection);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!linkUrl || connection) return;
    const supabase = createClient();
    const timer = window.setInterval(() => {
      void supabase.from("telegram_connections").select("telegram_username,linked_at").eq("profile_id", profileId).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setConnection(data as Connection);
            setLinkUrl("");
            setMessage("Telegram is connected. Choose whether to receive notifications there.");
          }
        });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [connection, linkUrl, profileId]);

  async function createLink() {
    setBusy(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      const { data, error: invokeError } = await supabase.functions.invoke("telegram-bridge", { body: { action: "create_link" } });
      if (invokeError) throw new Error(await edgeErrorMessage(invokeError, data) || "Could not create a Telegram link.");
      if (!data?.url) throw new Error(data?.error || "Could not create a Telegram link.");
      setLinkUrl(String(data.url));
      setMessage("This one-time link expires in 10 minutes. Open it in Telegram and press Start.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a Telegram link.");
    } finally { setBusy(false); }
  }

  async function setTelegramEnabled(value: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase.from("support_notification_preferences").upsert(
        { profile_id: profileId, telegram: value },
        { onConflict: "profile_id" },
      );
      if (saveError) throw saveError;
      setEnabled(value);
      setMessage(value ? "Telegram notifications are enabled." : "Telegram notifications are paused.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save notification preference.");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Telegram from your Betanor account?")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      const { error: unlinkError } = await supabase.from("telegram_connections").delete().eq("profile_id", profileId);
      if (unlinkError) throw unlinkError;
      setConnection(null); setEnabled(false); setLinkUrl("");
      setMessage("Telegram was disconnected. You can connect it again at any time.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Telegram.");
    } finally { setBusy(false); }
  }

  return <Card className="mt-6 p-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Messaging</p>
        <h2 className="mt-2 text-lg font-semibold text-[var(--betanor-navy)]">Telegram chat and notifications</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Connect your account to reply to customer-facing or authorized staff conversations from Telegram and receive Betanor alerts. Internal staff chats are available only to staff with chat access.</p>
      </div>
      {connection ? <span className="inline-flex items-center gap-2 self-start rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"><span className="size-2 rounded-full bg-emerald-500"/>Connected{connection.telegram_username ? ` · @${connection.telegram_username}` : ""}</span> : <span className="inline-flex items-center gap-2 self-start rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"><span className="size-2 rounded-full bg-slate-400"/>Not connected</span>}
    </div>

    <div className="mt-5 flex flex-col gap-3 border-t border-[var(--betanor-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-[var(--betanor-text)]">Telegram notifications</p>
        <p className="mt-1 text-xs text-[var(--betanor-muted)]">Chat replies work only for conversations your Betanor account is allowed to access.</p>
      </div>
      <label className={`inline-flex min-h-11 items-center gap-3 rounded-xl border px-4 text-sm font-medium ${connection ? "cursor-pointer border-[var(--betanor-border)]" : "cursor-not-allowed border-slate-200 opacity-50"}`}>
        <input type="checkbox" checked={enabled} disabled={!connection || busy} onChange={(event) => void setTelegramEnabled(event.target.checked)} className="size-4 accent-[var(--betanor-blue)]" />
        {enabled ? "On" : "Off"}
      </label>
    </div>

    <div className="mt-5 flex flex-wrap gap-3">
      {connection ? <Button type="button" variant="outline" disabled={busy} onClick={() => void disconnect()}>{busy ? "Please wait…" : "Disconnect Telegram"}</Button> : <Button type="button" disabled={busy} onClick={() => void createLink()}>{busy ? "Creating secure link…" : "Connect Telegram"}</Button>}
      {linkUrl ? <a href={linkUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-[var(--betanor-border)] px-4 text-sm font-semibold text-[var(--betanor-blue)] hover:bg-blue-50">Open Telegram</a> : null}
    </div>
    {linkUrl ? <p className="mt-3 break-all text-xs text-[var(--betanor-muted)]">The private linking token is embedded in this short-lived Telegram URL. Do not forward it to anyone else.</p> : null}
    {error ? <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
    {message ? <p role="status" className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-[var(--betanor-navy)]">{message}</p> : null}
  </Card>;
}
