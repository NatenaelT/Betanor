"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

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

export function TelegramBotSettings() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectedBot, setConnectedBot] = useState("");

  async function configure() {
    setBusy(true); setError(""); setConnectedBot("");
    try {
      const supabase = createClient();
      const { data, error: invokeError } = await supabase.functions.invoke("telegram-bridge", { body: { action: "configure_webhook" } });
      if (invokeError) throw new Error(await edgeErrorMessage(invokeError, data) || "Could not configure Telegram.");
      if (!data?.ok) throw new Error(data?.error || "Telegram did not confirm webhook setup.");
      setConnectedBot(data.botUsername ? `@${data.botUsername}` : "Telegram bot");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not configure Telegram.");
    } finally { setBusy(false); }
  }

  return <div className="mt-5 border-t border-[var(--betanor-border)] pt-5">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h3 className="font-semibold text-[var(--betanor-navy)]">Telegram bot connection</h3>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Set the bot token once as a Supabase Edge Function secret, then configure the secure webhook here. Users link Telegram from their personal profile.</p>
      </div>
      <Button type="button" disabled={busy} onClick={() => void configure()}>{busy ? "Configuring…" : "Configure Telegram webhook"}</Button>
    </div>
    <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs leading-5 text-[var(--betanor-muted)]">
      <li>Create the official Betanor bot with Telegram’s @BotFather.</li>
      <li>In Supabase → Edge Functions → Secrets, add <code className="rounded bg-slate-100 px-1">TELEGRAM_BOT_TOKEN</code>. Never paste the token into the portal or source code.</li>
      <li>Return here and configure the webhook. The bot will then accept one-time profile links.</li>
    </ol>
    {connectedBot ? <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Webhook active for {connectedBot}.</p> : null}
    {error ? <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
  </div>;
}
