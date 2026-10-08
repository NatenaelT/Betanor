"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChatMessage, type ChatMessageRecord } from "@/components/chat/chat-message";
import { createClient } from "@/lib/supabase/client";

const PAGE_SIZE = 50;
const messageFields = "id,body,sender_kind,sender_profile_id,is_internal,read_at,edited_at,deleted_at,attachment_name,task_id,project_id,telegram_sender_label,telegram_group_chat_id,telegram_group_message_id,created_at";

function asMessage(value: unknown): ChatMessageRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.body !== "string" || typeof row.sender_kind !== "string" || typeof row.created_at !== "string") return null;
  return row as unknown as ChatMessageRecord;
}

export function ChatMessageList({ messages: initialMessages, viewerId, canPin = false, conversationId }: { messages: ChatMessageRecord[]; viewerId: string | null; canPin?: boolean; conversationId?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState(initialMessages);
  const [hasOlder, setHasOlder] = useState(initialMessages.length === PAGE_SIZE);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState("");
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lastId]);

  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    const channel = supabase.channel(`betanor-chat-feed-${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const removedId = (payload.old as Record<string, unknown>).id;
          if (typeof removedId === "string") setMessages((current) => current.filter((message) => message.id !== removedId));
          return;
        }
        const next = asMessage(payload.new);
        if (!next) return;
        setMessages((current) => {
          const index = current.findIndex((message) => message.id === next.id);
          const updated = index >= 0
            ? current.map((message, itemIndex) => itemIndex === index ? { ...message, ...next } : message)
            : [...current, next];
          return updated.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_message_pins", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<string, unknown>;
        if (typeof row.message_id !== "string") return;
        const isPinned = payload.eventType !== "DELETE";
        setMessages((current) => current.map((message) => message.id === row.message_id ? { ...message, is_pinned: isPinned } : message));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId]);

  const applyChange = useCallback((change: Partial<ChatMessageRecord> & { id: string }) => {
    setMessages((current) => current.map((message) => message.id === change.id ? { ...message, ...change } : message));
  }, []);

  async function loadOlder() {
    const oldest = messages[0];
    if (!conversationId || !oldest || loadingOlder) return;
    setLoadingOlder(true);
    setLoadError("");
    const supabase = createClient();
    const { data, error } = await supabase.from("chat_messages")
      .select(messageFields)
      .eq("conversation_id", conversationId)
      .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) {
      setLoadError("Older messages could not be loaded. Try again.");
      setLoadingOlder(false);
      return;
    }
    const older = ((data ?? []) as ChatMessageRecord[]).reverse();
    if (canPin && older.length) {
      const { data: pins } = await supabase.from("chat_message_pins").select("message_id").eq("conversation_id", conversationId).in("message_id", older.map((message) => message.id));
      const pinned = new Set((pins ?? []).map((row) => row.message_id));
      older.forEach((message) => { message.is_pinned = pinned.has(message.id); });
    }
    setMessages((current) => [...older.filter((item) => !current.some((existing) => existing.id === item.id)), ...current]);
    setHasOlder(older.length === PAGE_SIZE);
    setLoadingOlder(false);
  }

  return <div ref={scrollRef} className="flex min-h-72 flex-1 flex-col gap-3 overflow-y-auto bg-[#f8fafc] px-3 py-5 sm:px-6" aria-label="Messages">
    {hasOlder ? <div className="flex justify-center"><button type="button" disabled={loadingOlder} onClick={() => void loadOlder()} className="min-h-9 rounded-full border border-[var(--betanor-border)] bg-white px-4 text-xs font-semibold text-[var(--betanor-blue)] disabled:opacity-60">{loadingOlder ? "Loading…" : "Load older messages"}</button></div> : null}
    {loadError ? <p role="alert" className="text-center text-xs text-rose-700">{loadError}</p> : null}
    {messages.some((message) => message.is_pinned) ? <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Pinned activity</p><p className="mt-1 line-clamp-2 text-xs text-amber-950">{messages.filter((message) => message.is_pinned).map((message) => message.body).join(" · ")}</p></div> : null}
    {messages.length ? messages.map((message) => <ChatMessage key={message.id} message={message} viewerId={viewerId} canPin={canPin} conversationId={conversationId} onChanged={applyChange} />) : <p className="m-auto text-sm text-[var(--betanor-muted)]">No messages yet.</p>}
  </div>;
}
