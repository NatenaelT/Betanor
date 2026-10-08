"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatMessage, type ChatMessageRecord } from "@/components/chat/chat-message";
import { createClient } from "@/lib/supabase/client";

type Message = ChatMessageRecord;
type Conversation = { id: string; reference: string; status: string; chat_messages?: Message[] };
type GuestRecord = { reference: string; status: string; message_id: string; sender_kind: string; body: string; created_at: string };

const GUEST_SESSION_KEY = "betanor-chat-session";
const CustomerAiAssistant = dynamic(() => import("@/components/ai/customer-ai-assistant").then((module) => module.CustomerAiAssistant), { ssr: false, loading: () => <div className="grid min-h-48 place-items-center text-xs text-[var(--betanor-muted)]">Loading Betanor AI…</div> });

export function CustomerChatWidget(props: { customerId?: string | null } = {}) {
  const pathname = usePathname();
  if (pathname.startsWith("/workspace")) return null;
  return <CustomerChatWidgetContent {...props} />;
}

function CustomerChatWidgetContent({ customerId: providedCustomerId }: { customerId?: string | null }) {
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
  const [online, setOnline] = useState(false);
  const [typing, setTyping] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [hasCustomerRole, setHasCustomerRole] = useState(false);
  const [chatTab, setChatTab] = useState<"assistant" | "live">("live");

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      const userId = data.user?.id ?? null;
      setViewerId(userId);
      if (!userId) { setHasCustomerRole(false); return; }
      const { data: roleRows } = await supabase.from("user_roles").select("roles(role_type)").eq("user_id", userId);
      const isCustomer = (roleRows ?? []).some((row) => {
        const relation = row.roles as unknown as { role_type?: string } | { role_type?: string }[] | null;
        const role = Array.isArray(relation) ? relation[0] : relation;
        return role?.role_type === "customer";
      });
      setHasCustomerRole(isCustomer);
      if (isCustomer) setChatTab("assistant");
    });
  }, []);

  const resolvedCustomerId = providedCustomerId ?? customerId;
  const isGuest = !resolvedCustomerId;
  const needsGuestIdentity = isGuest && !guestToken;

  useEffect(() => {
    if (providedCustomerId || !open) {
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

    if (!viewerId) return;
    const supabase = createClient();
    void supabase.from("customer_portal_access").select("customer_id").eq("profile_id", viewerId).eq("is_active", true).limit(1).maybeSingle().then(({ data: access }) => {
      if (access?.customer_id) setCustomerId(access.customer_id);
    });
  }, [open, providedCustomerId, viewerId]);

  const load = useCallback(async () => {
    const supabase = createClient();
    if (resolvedCustomerId) {
      const { data } = await supabase
        .from("chat_conversations")
        .select("id,reference,status,chat_messages(id,body,sender_kind,sender_profile_id,is_internal,read_at,edited_at,deleted_at,attachment_name,created_at)")
        .eq("customer_id", resolvedCustomerId)
        .order("updated_at", { ascending: false })
        .limit(50, { foreignTable: "chat_messages" })
        .order("created_at", { ascending: true, foreignTable: "chat_messages" })
        .limit(1)
        .maybeSingle();
      if (data) {
        setConversation(data as Conversation);
        void supabase.rpc("mark_chat_messages_read", { conversation_id_input: data.id });
      }
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
    const timer = resolvedCustomerId ? null : window.setInterval(() => void load(), 45000);
    return () => {
      window.clearTimeout(firstLoad);
      if (timer) window.clearInterval(timer);
    };
  }, [open, resolvedCustomerId, load]);

  useEffect(() => {
    const conversationId = conversation?.id && !conversation.id.startsWith("guest:") ? conversation.id : null;
    if (!open || !conversationId) return;
    const supabase = createClient();
    const channel = supabase.channel(`betanor-chat-presence-${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const removedId = (payload.old as Record<string, unknown>).id;
          if (typeof removedId === "string") setConversation((current) => current ? { ...current, chat_messages: current.chat_messages?.filter((item) => item.id !== removedId) } : current);
          return;
        }
        const row = payload.new as Partial<Message>;
        if (typeof row.id !== "string" || typeof row.body !== "string" || row.is_internal) return;
        setConversation((current) => {
          if (!current) return current;
          const currentMessages = current.chat_messages ?? [];
          const index = currentMessages.findIndex((item) => item.id === row.id);
          const next = index >= 0
            ? currentMessages.map((item, itemIndex) => itemIndex === index ? { ...item, ...row } as Message : item)
            : [...currentMessages, row as Message];
          return { ...current, chat_messages: next.sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-50) };
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_conversations", filter: `id=eq.${conversationId}` }, (payload) => {
        const row = payload.new as { status?: string };
        if (row.status) setConversation((current) => current ? { ...current, status: row.status! } : current);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const entries = Object.values(state).flat() as Array<{ sender_kind?: string; typing?: boolean }>;
        setTyping(entries.some((entry) => entry.sender_kind === "agent" && entry.typing));
      })
      .subscribe((status) => setOnline(status === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(channel);
      setOnline(false);
      setTyping(false);
    };
  }, [open, conversation?.id]);

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

  const applyMessageChange = useCallback((change: Partial<Message> & { id: string }) => {
    setConversation((current) => current ? {
      ...current,
      chat_messages: current.chat_messages?.map((message) => message.id === change.id ? { ...message, ...change } : message),
    } : current);
  }, []);

  const statusLabel = useMemo(() => {
    if (typing) return "Betanor team is typing…";
    if (!conversation) return "Start a conversation with Betanor";
    if (conversation.status === "resolved" || conversation.status === "closed") return "This conversation is closed";
    return "A support specialist will reply here";
  }, [conversation, typing]);

  return <div className="pwa-safe-floating fixed z-[60]">
    <button type="button" aria-expanded={open} aria-label={open ? "Close Betanor chat" : "Open Betanor chat"} onClick={() => setOpen((value) => !value)} className="grid size-14 place-items-center rounded-full bg-[var(--betanor-button-bg)] text-2xl text-[var(--betanor-button-text)] shadow-xl ring-4 ring-white transition-transform hover:scale-105">{open ? "×" : "💬"}</button>
    {open ? <div className="absolute right-0 bottom-18 flex max-h-[min(82dvh,42rem)] w-[min(92vw,24rem)] flex-col overflow-hidden rounded-2xl border border-[var(--betanor-border)] bg-white shadow-2xl">
      <div className="bg-[var(--betanor-navy)] px-4 py-3 text-white"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{hasCustomerRole && chatTab === "assistant" ? "Betanor AI assistant" : "Betanor live support"}</p><p className="mt-1 text-xs text-blue-100">{hasCustomerRole && chatTab === "assistant" ? "Published website information · AI-generated" : statusLabel}</p></div><span className={`size-2 shrink-0 rounded-full ${online || !resolvedCustomerId ? "bg-emerald-400" : "bg-slate-400"}`} aria-label={online ? "Chat online" : "Chat offline"} /></div></div>
      {hasCustomerRole ? <div role="tablist" aria-label="Betanor chat options" className="flex border-b border-[var(--betanor-border)] bg-slate-50 p-1.5"><button type="button" role="tab" aria-selected={chatTab === "assistant"} onClick={() => setChatTab("assistant")} className={`min-h-9 flex-1 rounded-lg px-2 text-xs font-semibold ${chatTab === "assistant" ? "bg-white text-[var(--betanor-navy)] shadow-sm" : "text-[var(--betanor-muted)] hover:text-[var(--betanor-navy)]"}`}>AI assistant</button><button type="button" role="tab" aria-selected={chatTab === "live"} onClick={() => setChatTab("live")} className={`min-h-9 flex-1 rounded-lg px-2 text-xs font-semibold ${chatTab === "live" ? "bg-white text-[var(--betanor-navy)] shadow-sm" : "text-[var(--betanor-muted)] hover:text-[var(--betanor-navy)]"}`}>Live support</button></div> : null}
      {hasCustomerRole && chatTab === "assistant" ? <div className="flex min-h-0 flex-1 flex-col"><CustomerAiAssistant /></div> : <>
        <div className="max-h-72 min-h-36 space-y-2 overflow-y-auto p-4">{conversation?.chat_messages?.length ? conversation.chat_messages.map((message) => <ChatMessage key={message.id} message={message} viewerId={viewerId} compact onChanged={applyMessageChange} />) : <p className="text-sm leading-6 text-[var(--betanor-muted)]">Send a message and the Betanor team will pick it up from the staff inbox.</p>}</div>
        {conversation?.status === "closed" || conversation?.status === "resolved" ? <div className="border-t border-[var(--betanor-border)] bg-slate-50 px-4 py-3 text-xs text-[var(--betanor-muted)]">This conversation has been closed. Start a new chat from the message form.</div> : resolvedCustomerId && conversation ? <div className="border-t border-[var(--betanor-border)] p-3"><ChatComposer conversationId={conversation.id} senderKind="customer" placeholder="Write to Betanor…" /></div> : <form onSubmit={send} className="space-y-2 border-t border-[var(--betanor-border)] p-3">{needsGuestIdentity ? <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Your name" autoComplete="name" required minLength={2} value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Your name" /><Input aria-label="Your email" type="email" autoComplete="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} placeholder="Email (optional)" /></div> : null}<div className="flex items-center gap-2"><Input aria-label="Chat topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Topic" /><button type="button" className="rounded-lg border border-[var(--betanor-border)] px-2 py-2 text-lg" aria-label="Add emoji" onClick={() => setBody((value) => `${value} 😊`)}>😊</button></div><textarea aria-label="Chat message" required minLength={2} value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="How can we help?" />{error ? <p className="text-xs text-[var(--betanor-danger)]">{error}</p> : null}<Button type="submit" size="sm" disabled={loading}>{loading ? "Sending…" : conversation ? "Send message" : "Start chat"}</Button></form>}
      </>}
    </div> : null}
  </div>;
}
