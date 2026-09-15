"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type Message = { id: string; body: string; sender_kind: string; created_at: string };
type Conversation = { id: string; reference: string; status: string; chat_messages?: Message[] };

export function CustomerChatWidget({ customerId }: { customerId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("Customer support");
  const [body, setBody] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!customerId) return;
    const { data } = await createClient().from("chat_conversations").select("id,reference,status,chat_messages(id,body,sender_kind,created_at)").eq("customer_id", customerId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (data) setConversation(data as Conversation);
  }, [customerId]);

  useEffect(() => {
    if (!customerId) return;
    const supabase = createClient();
    const channel = supabase.channel(`customer-chat-${customerId}`).on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [customerId, load]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!body.trim()) return;
    setLoading(true); setError(null);
    const { error: rpcError } = await createClient().rpc("start_customer_chat", { topic_input: topic.trim(), message_input: body.trim() });
    if (rpcError) setError(rpcError.message); else { setBody(""); await load(); }
    setLoading(false);
  }

  if (!customerId) return null;
  return <div className="fixed right-4 bottom-4 z-30 sm:right-6 sm:bottom-6"><button type="button" aria-expanded={open} aria-label={open ? "Close live chat" : "Open live chat"} onClick={() => { setOpen(!open); if (!open) void load(); }} className="grid size-14 place-items-center rounded-full bg-[var(--betanor-navy)] text-2xl text-white shadow-xl transition-transform hover:scale-105">{open ? "×" : "◌"}</button>{open ? <div className="absolute right-0 bottom-18 flex w-[min(92vw,23rem)] flex-col overflow-hidden rounded-2xl border border-[var(--betanor-border)] bg-white shadow-2xl"><div className="bg-[var(--betanor-navy)] px-4 py-3 text-white"><p className="text-sm font-semibold">Betanor live support</p><p className="mt-1 text-xs text-blue-100">A support specialist will reply in this conversation.</p></div><div className="max-h-72 space-y-2 overflow-y-auto p-4">{conversation?.chat_messages?.length ? conversation.chat_messages.map((message) => <div key={message.id} className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${message.sender_kind === "customer" ? "ml-auto bg-blue-50 text-[var(--betanor-navy)]" : "bg-slate-100 text-[var(--betanor-text)]"}`}>{message.body}</div>) : <p className="text-sm leading-6 text-[var(--betanor-muted)]">Send a message and the Betanor team will pick it up from the staff inbox.</p>}</div><form onSubmit={send} className="space-y-2 border-t border-[var(--betanor-border)] p-3"><Input aria-label="Chat topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Topic" /><textarea aria-label="Chat message" required minLength={2} value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="How can we help?" />{error ? <p className="text-xs text-[var(--betanor-danger)]">{error}</p> : null}<Button type="submit" size="sm" disabled={loading}>{loading ? "Sending…" : "Send message"}</Button></form></div> : null}</div>;
}
