"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type Message = { id: string; body: string; sender_kind: string; created_at: string };
type Conversation = { id: string; reference: string; status: string; chat_messages?: Message[] };
type GuestRecord = { reference: string; status: string; message_id: string; sender_kind: string; body: string; created_at: string };

const GUEST_SESSION_KEY = "betanor-chat-session";

export function CustomerChatWidget({ customerId: providedCustomerId }: { customerId?: string | null } = {}) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("Customer support");
  const [body, setBody] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [customerId, setCustomerId] = useState(providedCustomerId ?? null);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedCustomerId = providedCustomerId ?? customerId;
  const isGuest = !resolvedCustomerId;
  const needsGuestIdentity = isGuest && !guestToken;

  useEffect(() => {
    if (providedCustomerId) {
      return;
    }

    const stored = window.sessionStorage.getItem(GUEST_SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { token?: string; name?: string; email?: string };
        window.setTimeout(() => {
          if (parsed.token) setGuestToken(parsed.token);
          if (parsed.name) setGuestName(parsed.name);
          if (parsed.email) setGuestEmail(parsed.email);
        }, 0);
      } catch {
        window.sessionStorage.removeItem(GUEST_SESSION_KEY);
      }
    }

    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: access } = await supabase
        .from("customer_portal_access")
        .select("customer_id")
        .eq("profile_id", data.user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (access?.customer_id) setCustomerId(access.customer_id);
    });
  }, [providedCustomerId]);

  const load = useCallback(async () => {
    const supabase = createClient();
    if (resolvedCustomerId) {
      const { data } = await supabase
        .from("chat_conversations")
        .select("id,reference,status,chat_messages(id,body,sender_kind,created_at)")
        .eq("customer_id", resolvedCustomerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setConversation(data as Conversation);
      return;
    }
    if (!guestToken) return;
    const { data, error: guestError } = await supabase.rpc("get_guest_chat", { token_input: guestToken });
    if (guestError) {
      setError(guestError.message);
      return;
    }
    const records = (data ?? []) as GuestRecord[];
    if (!records.length) return;
    setConversation({
      id: `guest:${records[0].reference}`,
      reference: records[0].reference,
      status: records[0].status,
      chat_messages: records.map((record) => ({ id: record.message_id, body: record.body, sender_kind: record.sender_kind, created_at: record.created_at })),
    });
  }, [resolvedCustomerId, guestToken]);

  useEffect(() => {
    if (!open) return;
    const firstLoad = window.setTimeout(() => void load(), 0);
    const supabase = createClient();
    const filter = resolvedCustomerId ? undefined : conversation?.id.startsWith("guest:") ? undefined : conversation?.id;
    const channel = supabase.channel(`betanor-chat-${resolvedCustomerId ?? guestToken ?? "guest"}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chat_messages", ...(filter ? { filter: `conversation_id=eq.${filter}` } : {}) },
      () => void load(),
    ).subscribe();
    const timer = window.setInterval(() => void load(), 10000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(firstLoad);
      void supabase.removeChannel(channel);
    };
  }, [open, resolvedCustomerId, guestToken, conversation?.id, load]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || (needsGuestIdentity && guestName.trim().length < 2)) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    if (resolvedCustomerId) {
      const { error: rpcError } = await supabase.rpc("start_customer_chat", { topic_input: topic.trim(), message_input: body.trim() });
      if (rpcError) setError(rpcError.message);
      else setBody("");
    } else if (!guestToken) {
      const { data, error: rpcError } = await supabase.rpc("start_guest_chat", {
        name_input: guestName.trim(),
        email_input: guestEmail.trim(),
        topic_input: topic.trim(),
        message_input: body.trim(),
      });
      const session = Array.isArray(data) ? data[0] : data;
      if (rpcError || !session?.token) setError(rpcError?.message || "We could not start the conversation.");
      else {
        const next = { token: session.token as string, name: guestName.trim(), email: guestEmail.trim() };
        window.sessionStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(next));
        setGuestToken(next.token);
        setBody("");
      }
    } else {
      const { error: rpcError } = await supabase.rpc("send_guest_chat_message", { token_input: guestToken, message_input: body.trim() });
      if (rpcError) setError(rpcError.message);
      else setBody("");
    }
    await load();
    setLoading(false);
  }

  const statusLabel = useMemo(() => {
    if (!conversation) return "Start a conversation with Betanor";
    if (conversation.status === "resolved" || conversation.status === "closed") return "This conversation is closed";
    return "A support specialist will reply here";
  }, [conversation]);

  return <div className="fixed right-4 bottom-4 z-[60] sm:right-6 sm:bottom-6">
    <button type="button" aria-expanded={open} aria-label={open ? "Close live chat" : "Open live chat"} onClick={() => setOpen((value) => !value)} className="grid size-14 place-items-center rounded-full bg-[var(--betanor-button-bg)] text-2xl text-[var(--betanor-button-text)] shadow-xl ring-4 ring-white transition-transform hover:scale-105">{open ? "×" : "💬"}</button>
    {open ? <div className="absolute right-0 bottom-18 flex w-[min(92vw,24rem)] flex-col overflow-hidden rounded-2xl border border-[var(--betanor-border)] bg-white shadow-2xl">
      <div className="bg-[var(--betanor-navy)] px-4 py-3 text-white"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Betanor live support</p><p className="mt-1 text-xs text-blue-100">{statusLabel}</p></div><span className="size-2 rounded-full bg-emerald-400" aria-label="Chat online" /></div></div>
      <div className="max-h-72 space-y-2 overflow-y-auto p-4">{conversation?.chat_messages?.length ? conversation.chat_messages.map((message) => <div key={message.id} className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${message.sender_kind === "customer" || message.sender_kind === "guest" ? "ml-auto bg-blue-50 text-[var(--betanor-navy)]" : "bg-slate-100 text-[var(--betanor-text)]"}`}>{message.body}</div>) : <p className="text-sm leading-6 text-[var(--betanor-muted)]">Send a message and the Betanor team will pick it up from the staff inbox.</p>}</div>
      {conversation?.status === "closed" || conversation?.status === "resolved" ? <div className="border-t border-[var(--betanor-border)] bg-slate-50 px-4 py-3 text-xs text-[var(--betanor-muted)]">This conversation has been closed. Start a new chat by refreshing the page.</div> : <form onSubmit={send} className="space-y-2 border-t border-[var(--betanor-border)] p-3">{needsGuestIdentity ? <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Your name" required minLength={2} value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Your name" /><Input aria-label="Your email" type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} placeholder="Email (optional)" /></div> : null}<Input aria-label="Chat topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Topic" /><textarea aria-label="Chat message" required minLength={2} value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="How can we help?" />{error ? <p className="text-xs text-[var(--betanor-danger)]">{error}</p> : null}<Button type="submit" size="sm" disabled={loading}>{loading ? "Sending…" : conversation ? "Send message" : "Start chat"}</Button></form>}
    </div> : null}
  </div>;
}
