"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatMessage, type ChatMessageRecord } from "@/components/chat/chat-message";
import { usePwaInstall } from "@/components/pwa/pwa-runtime";
import { createClient } from "@/lib/supabase/client";

type Message = ChatMessageRecord;
type Conversation = { id: string; reference: string; status: string; chat_messages?: Message[] };
type GuestRecord = { reference: string; status: string; message_id: string; sender_kind: string; body: string; created_at: string };
type AssistantReply = { id: string; body: string; created_at: string };
type TranscriptItem =
  | { kind: "message"; created_at: string; message: Message }
  | { kind: "assistant"; created_at: string; reply: AssistantReply };

const GUEST_SESSION_KEY = "betanor-chat-session";
const PRESENCE_WAIT_MS = 1800;

function storedAssistantReplies(conversationId: string): AssistantReply[] {
  try {
    const stored = window.sessionStorage.getItem(`betanor-chat-ai-${conversationId}`);
    const parsed = stored ? JSON.parse(stored) as AssistantReply[] : [];
    return Array.isArray(parsed) ? parsed.filter((reply) => typeof reply.body === "string").slice(-30) : [];
  } catch {
    return [];
  }
}

export function CustomerChatWidget(props: { customerId?: string | null } = {}) {
  const pathname = usePathname();
  if (pathname.startsWith("/workspace")) return null;
  return <CustomerChatWidgetContent {...props} />;
}

function CustomerChatWidgetContent({ customerId: providedCustomerId }: { customerId?: string | null }) {
  const { lowDataMode } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(providedCustomerId ?? null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [assistantReplies, setAssistantReplies] = useState<AssistantReply[]>([]);
  const [loading, setLoading] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentActive, setAgentActive] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const agentActiveRef = useRef(false);
  const presenceReadyRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const assistantBusyRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => setViewerId(data.user?.id ?? null));
  }, []);

  const resolvedCustomerId = providedCustomerId ?? customerId;
  const isGuest = !resolvedCustomerId;

  useEffect(() => {
    if (providedCustomerId || !open) return;

    const stored = window.sessionStorage.getItem(GUEST_SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { token?: string };
        if (parsed.token) window.setTimeout(() => setGuestToken(parsed.token!), 0);
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

  const load = useCallback(async (guestTokenOverride?: string): Promise<Conversation | null> => {
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
      if (!data) return null;
      const loaded = data as Conversation;
      activeConversationIdRef.current = loaded.id;
      setAssistantReplies(storedAssistantReplies(loaded.id));
      setConversation(loaded);
      void supabase.rpc("mark_chat_messages_read", { conversation_id_input: loaded.id });
      return loaded;
    }

    const token = guestTokenOverride ?? guestToken;
    if (!token) return null;
    const [{ data, error: guestError }, { data: sessionRows }] = await Promise.all([
      supabase.rpc("get_guest_chat", { token_input: token }),
      supabase.rpc("get_guest_chat_session", { token_input: token }),
    ]);
    if (guestError) {
      setError(guestError.message);
      return null;
    }
    const records = (data ?? []) as GuestRecord[];
    const guestSession = Array.isArray(sessionRows) ? sessionRows[0] as { conversation_id?: string; conversation_status?: string } | undefined : undefined;
    if (!records.length) {
      if (!guestSession) {
        window.sessionStorage.removeItem(GUEST_SESSION_KEY);
        setGuestToken((current) => current === token ? null : current);
        activeConversationIdRef.current = null;
        setConversation(null);
        setAssistantReplies([]);
      }
      return null;
    }
    const loaded: Conversation = {
      id: guestSession?.conversation_id || `guest:${records[0].reference}`,
      reference: records[0].reference,
      status: guestSession?.conversation_status || records[0].status,
      chat_messages: records.map((record) => ({ id: record.message_id, body: record.body, sender_kind: record.sender_kind, created_at: record.created_at })),
    };
    activeConversationIdRef.current = loaded.id.startsWith("guest:") ? null : loaded.id;
    setAssistantReplies(storedAssistantReplies(loaded.id));
    setConversation(loaded);
    return loaded;
  }, [resolvedCustomerId, guestToken]);

  useEffect(() => {
    if (!open) return;
    const firstLoad = window.setTimeout(() => void load(), 0);
    const timer = isGuest ? window.setInterval(() => void load(), lowDataMode ? 120000 : 45000) : null;
    return () => {
      window.clearTimeout(firstLoad);
      if (timer) window.clearInterval(timer);
    };
  }, [open, isGuest, lowDataMode, load]);

  useEffect(() => {
    const conversationId = conversation?.id && !conversation.id.startsWith("guest:") ? conversation.id : null;
    if (!open || !conversationId) return;
    const supabase = createClient();
    activeConversationIdRef.current = conversationId;
    presenceReadyRef.current = false;
    agentActiveRef.current = false;
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
        if (activeConversationIdRef.current !== conversationId) return;
        const state = channel.presenceState();
        const entries = Object.values(state).flat() as Array<{ sender_kind?: string; typing?: boolean }>;
        const isAgentActive = entries.some((entry) => entry.sender_kind === "agent");
        agentActiveRef.current = isAgentActive;
        presenceReadyRef.current = true;
        setAgentActive(isAgentActive);
        setAgentTyping(entries.some((entry) => entry.sender_kind === "agent" && entry.typing));
      })
      .subscribe((status) => setRealtimeConnected(status === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(channel);
      if (activeConversationIdRef.current === conversationId) {
        activeConversationIdRef.current = null;
        presenceReadyRef.current = false;
        agentActiveRef.current = false;
      }
      setRealtimeConnected(false);
      setAgentActive(false);
      setAgentTyping(false);
    };
  }, [open, conversation?.id]);

  const waitForAgentPresence = useCallback(async (conversationId: string) => {
    if (conversationId.startsWith("guest:")) return false;
    const startedAt = Date.now();
    while (activeConversationIdRef.current === conversationId && !presenceReadyRef.current && Date.now() - startedAt < PRESENCE_WAIT_MS) {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }
    return activeConversationIdRef.current === conversationId && agentActiveRef.current;
  }, []);

  const requestAssistant = useCallback(async (customerMessage: string, activeConversation: Conversation, token?: string | null) => {
    const text = customerMessage.trim();
    if (text.length < 2 || assistantBusyRef.current || activeConversation.status === "closed" || activeConversation.status === "resolved") return;
    if (await waitForAgentPresence(activeConversation.id)) return;

    assistantBusyRef.current = true;
    setAssistantLoading(true);
    setError(null);
    const history = [
      ...(activeConversation.chat_messages ?? [])
        .filter((message) => !message.is_internal && !message.deleted_at && ["agent", "customer", "guest"].includes(message.sender_kind))
        .map((message) => ({ role: message.sender_kind === "agent" ? "assistant" as const : "user" as const, text: message.body, created_at: message.created_at })),
      ...assistantReplies.map((reply) => ({ role: "assistant" as const, text: reply.body, created_at: reply.created_at })),
    ].sort((left, right) => left.created_at.localeCompare(right.created_at)).slice(-12).map(({ role, text }) => ({ role, text }));
    const last = history.at(-1);
    if (!(last?.role === "user" && last.text === text)) history.push({ role: "user", text });

    const reply: AssistantReply = { id: `ai-${crypto.randomUUID()}`, body: "", created_at: new Date().toISOString() };
    setAssistantReplies((current) => [...current, reply].slice(-30));
    try {
      const response = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "customer_chat",
          ...(token ? { guestToken: token } : {}),
          messages: history.map((message) => ({ role: message.role, parts: [{ type: "text", text: message.text }] })),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Betanor AI could not answer just now.");
      }
      if (!response.body) throw new Error("Betanor AI could not answer just now.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setAssistantReplies((current) => current.map((item) => item.id === reply.id ? { ...item, body: answer } : item));
      }
      answer += decoder.decode();
      if (!answer.trim()) throw new Error("Betanor AI could not answer just now.");
      const completed = { ...reply, body: answer };
      setAssistantReplies((current) => current.map((item) => item.id === reply.id ? completed : item).slice(-30));
      const savedReplies = [...assistantReplies.filter((item) => item.id !== reply.id), completed].slice(-30);
      window.sessionStorage.setItem(`betanor-chat-ai-${activeConversation.id}`, JSON.stringify(savedReplies));
    } catch (caught) {
      setAssistantReplies((current) => current.filter((item) => item.id !== reply.id));
      setError(caught instanceof Error ? `${caught.message} Your message is still in the Betanor support conversation.` : "Your message is in the Betanor support conversation; the AI could not answer just now.");
    } finally {
      assistantBusyRef.current = false;
      setAssistantLoading(false);
    }
  }, [assistantReplies, waitForAgentPresence]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sentText = body.trim();
    if (sentText.length < 2) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    let activeConversation: Conversation | null = null;
    let activeGuestToken = guestToken;

    if (resolvedCustomerId) {
      const { error: rpcError } = await supabase.rpc("start_customer_chat", { topic_input: "Customer support", message_input: sentText });
      if (rpcError) setError(rpcError.message);
      else activeConversation = await load();
    } else if (!guestToken) {
      const { data, error: rpcError } = await supabase.rpc("start_guest_chat", {
        name_input: "Website visitor",
        email_input: "",
        topic_input: "Customer support",
        message_input: sentText,
      });
      const session = Array.isArray(data) ? data[0] : data;
      if (rpcError || !session?.token) setError(rpcError?.message || "We could not start the conversation.");
      else {
        activeGuestToken = session.token as string;
        window.sessionStorage.setItem(GUEST_SESSION_KEY, JSON.stringify({ token: activeGuestToken }));
        setGuestToken(activeGuestToken);
        activeConversation = await load(activeGuestToken);
      }
    } else {
      const { data, error: rpcError } = await supabase.rpc("send_guest_chat_message", { token_input: guestToken, message_input: sentText });
      if (rpcError || data === false) setError(rpcError?.message || "This conversation could not be continued. Start a new chat.");
      else activeConversation = await load(guestToken);
    }

    setLoading(false);
    if (activeConversation) {
      setBody("");
      void requestAssistant(sentText, activeConversation, activeGuestToken);
    }
  }

  const applyMessageChange = useCallback((change: Partial<Message> & { id: string }) => {
    setConversation((current) => current ? {
      ...current,
      chat_messages: current.chat_messages?.map((message) => message.id === change.id ? { ...message, ...change } : message),
    } : current);
  }, []);

  const statusLabel = useMemo(() => {
    if (agentTyping) return "Betanor team is typing…";
    if (agentActive) return "A Betanor support agent is active";
    if (assistantLoading) return "Betanor AI is responding…";
    if (conversation?.status === "resolved" || conversation?.status === "closed") return "This conversation is closed";
    return "Ask anything about Betanor; AI replies when our team is away";
  }, [agentTyping, agentActive, assistantLoading, conversation?.status]);

  const transcript = useMemo<TranscriptItem[]>(() => [
    ...(conversation?.chat_messages ?? [])
      .filter((message) => !message.is_internal)
      .map((message): TranscriptItem => ({ kind: "message", message, created_at: message.created_at })),
    ...assistantReplies.filter((reply) => reply.body).map((reply): TranscriptItem => ({ kind: "assistant", reply, created_at: reply.created_at })),
  ].sort((left, right) => left.created_at.localeCompare(right.created_at)), [conversation?.chat_messages, assistantReplies]);

  return <div className="pwa-safe-floating fixed z-[60]">
    <button type="button" aria-expanded={open} aria-label={open ? "Close Betanor chat" : "Open Betanor chat"} onClick={() => setOpen((value) => !value)} className="grid size-14 place-items-center rounded-full bg-[var(--betanor-button-bg)] text-2xl text-[var(--betanor-button-text)] shadow-xl ring-4 ring-white transition-transform hover:scale-105">{open ? "×" : "💬"}</button>
    {open ? <div className="absolute right-0 bottom-18 flex max-h-[min(82dvh,42rem)] w-[min(92vw,24rem)] flex-col overflow-hidden rounded-2xl border border-[var(--betanor-border)] bg-white shadow-2xl">
      <div className="bg-[var(--betanor-navy)] px-4 py-3 text-white"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Betanor support</p><p className="mt-1 text-xs text-blue-100">{statusLabel}</p></div><span className={`size-2 shrink-0 rounded-full ${agentActive ? "bg-emerald-400" : "bg-[var(--betanor-gold)]"}`} aria-label={agentActive ? "A support agent is active" : realtimeConnected ? "AI support is available" : "AI support"} /></div></div>
      <div className="max-h-80 min-h-36 space-y-2 overflow-y-auto p-4" aria-live="polite" aria-relevant="additions text">
        {transcript.length ? transcript.map((item) => item.kind === "message"
          ? <ChatMessage key={item.message.id} message={item.message} viewerId={viewerId} compact onChanged={applyMessageChange} />
          : <div key={item.reply.id} className="max-w-[92%] rounded-2xl rounded-bl-md border border-[var(--betanor-border)] bg-white px-3 py-2.5 text-sm leading-6 text-[var(--betanor-text)]"><p className="whitespace-pre-wrap break-words">{item.reply.body}</p><p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--betanor-muted)]">Betanor AI</p></div>)
          : <p className="text-sm leading-6 text-[var(--betanor-muted)]">Ask anything about Betanor. When a support agent is not active, Betanor AI answers using the company’s published information.</p>}
        {assistantLoading && !assistantReplies.some((reply) => !reply.body) ? <p className="text-xs text-[var(--betanor-muted)]" role="status">Betanor AI is responding…</p> : null}
      </div>
      {conversation?.status === "closed" || conversation?.status === "resolved" ? <div className="border-t border-[var(--betanor-border)] bg-slate-50 px-4 py-3 text-xs text-[var(--betanor-muted)]">This conversation is closed.</div> : resolvedCustomerId && conversation ? <div className="border-t border-[var(--betanor-border)] p-3"><ChatComposer conversationId={conversation.id} senderKind="customer" placeholder="Message Betanor…" disabled={assistantLoading} onSent={(message) => void requestAssistant(message, conversation)} /><p className="mt-2 text-[10px] leading-4 text-[var(--betanor-muted)]">When no agent is active, an AI service answers from published Betanor information. Messages are saved in this support conversation.</p>{error ? <p className="mt-2 text-xs text-[var(--betanor-danger)]">{error}</p> : null}</div> : <form onSubmit={send} className="space-y-2 border-t border-[var(--betanor-border)] p-3"><div className="flex items-center gap-2"><Input aria-label="Chat message" autoComplete="off" disabled={loading || assistantLoading} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message…" /><button type="button" disabled={loading || assistantLoading} className="rounded-lg border border-[var(--betanor-border)] px-2 py-2 text-lg disabled:opacity-50" aria-label="Add emoji" onClick={() => setBody((value) => `${value} 😊`)}>😊</button><Button type="submit" size="sm" disabled={loading || assistantLoading || body.trim().length < 2}>{loading ? "Sending…" : "Send"}</Button></div>{error ? <p className="text-xs text-[var(--betanor-danger)]">{error}</p> : null}<p className="text-[10px] leading-4 text-[var(--betanor-muted)]">When no agent is active, an AI service answers from published Betanor information. Messages are saved in this support conversation.</p></form>}
    </div> : null}
  </div>;
}
