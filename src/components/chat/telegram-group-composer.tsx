"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function TelegramGroupComposer({ conversationId }: { conversationId: string }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    const supabase = createClient();
    const { data, error: invokeError } = await supabase.functions.invoke("telegram-bridge", {
      body: { action: "send_group_reply", conversationId, message: text },
    });
    if (invokeError || data?.ok !== true) {
      setError(data?.error || invokeError?.message || "Your reply could not be sent.");
      setSending(false);
      return;
    }
    setMessage("");
    setSending(false);
  }

  return <form onSubmit={send} className="border-t border-[var(--betanor-border)] bg-white px-3 pb-3 pt-2 sm:px-5">
    <label htmlFor="telegram-group-reply" className="sr-only">Reply to the Telegram group</label>
    <textarea id="telegram-group-reply" value={message} onChange={(event) => setMessage(event.target.value)} rows={2} maxLength={4000} placeholder="Reply to the Telegram group…" className="w-full resize-y rounded-xl border border-[var(--betanor-border)] px-3 py-2 text-sm outline-none transition focus:border-[var(--betanor-blue)]" />
    <div className="mt-2 flex items-center justify-between gap-3">
      <p className="min-w-0 text-xs text-[var(--betanor-muted)]" role={error ? "alert" : undefined}>{error || "Your reply is sent to Telegram and saved in this conversation."}</p>
      <Button type="submit" size="sm" disabled={sending || !message.trim()}>{sending ? "Sending…" : "Send reply"}</Button>
    </div>
  </form>;
}
