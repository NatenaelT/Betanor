"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function ChatComposer({ conversationId, senderKind, isInternal = false, placeholder = "Write a message…", onSent }: { conversationId: string; senderKind: "agent" | "customer"; isInternal?: boolean; placeholder?: string; onSent?: () => void }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`betanor-chat-presence-${conversationId}`);
    channelRef.current = channel;
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ actor_id: data.user.id, sender_kind: senderKind, typing: false });
      });
    });
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, senderKind]);

  function updateBody(value: string) {
    setBody(value);
    const channel = channelRef.current;
    if (!channel) return;
    void channel.track({ sender_kind: senderKind, typing: value.trim().length > 0 });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => void channel.track({ sender_kind: senderKind, typing: false }), 1800);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() && !file) return;
    if (file && file.size > MAX_FILE_SIZE) { setError("Attachments must be 10 MB or smaller."); return; }
    setSaving(true); setError(null);
    const supabase = createClient();
    const { data: identity } = await supabase.auth.getUser();
    if (!identity.user) { setError("Your session has expired. Please sign in again."); setSaving(false); return; }
    let attachment: { attachment_path: string; attachment_name: string; attachment_mime_type: string; attachment_size_bytes: number } | null = null;
    if (file) {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120);
      const path = `${conversationId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("betanor-chat-attachments").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploadError) { setError(uploadError.message); setSaving(false); return; }
      attachment = { attachment_path: path, attachment_name: file.name, attachment_mime_type: file.type || "application/octet-stream", attachment_size_bytes: file.size };
    }
    const { error: insertError } = await supabase.from("chat_messages").insert({ conversation_id: conversationId, sender_profile_id: identity.user.id, sender_kind: senderKind, body: body.trim() || `Shared ${file?.name || "attachment"}`, is_internal: isInternal, ...attachment });
    if (insertError) { setError(insertError.message); setSaving(false); return; }
    await supabase.rpc("mark_chat_messages_read", { conversation_id_input: conversationId });
    setBody(""); setFile(null); setSaving(false);
    if (channelRef.current) void channelRef.current.track({ sender_kind: senderKind, typing: false });
    onSent?.();
    router.refresh();
  }

  return <form onSubmit={send} className="mt-4 space-y-2">
    <textarea required={!file} value={body} onChange={(event) => updateBody(event.target.value)} rows={2} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder={placeholder} />
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="rounded-lg border border-[var(--betanor-border)] px-2 py-1.5 text-lg" aria-label="Add emoji" onClick={() => updateBody(`${body} 😊`)}>😊</button>
      <label className="inline-flex min-h-8 cursor-pointer items-center rounded-lg border border-[var(--betanor-border)] px-3 text-xs font-semibold text-[var(--betanor-navy)] hover:bg-[var(--betanor-surface)]">📎 Attach<input type="file" className="sr-only" accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.zip" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      {file ? <span className="max-w-52 truncate text-xs text-[var(--betanor-muted)]">{file.name}</span> : null}
      {error ? <span className="text-xs text-[var(--betanor-danger)]">{error}</span> : null}
      <Button type="submit" size="sm" disabled={saving}>{saving ? "Sending…" : "Send"}</Button>
    </div>
  </form>;
}
