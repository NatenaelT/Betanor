"use client";

import { useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

import { Button } from "@/components/ui/button";

const customerAssistantTransport = new DefaultChatTransport({
  api: "/api/ai/assistant",
  prepareSendMessagesRequest: ({ messages }) => ({
    body: { purpose: "customer_chat", messages: messages.slice(-12) },
  }),
});

export function CustomerAiAssistant() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: "betanor-customer-assistant",
    transport: customerAssistantTransport,
  });
  const sending = status === "submitted" || status === "streaming";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    sendMessage({ text });
    setInput("");
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex items-center justify-between gap-3 border-b border-[var(--betanor-border)] px-4 py-2.5">
      <p className="text-xs text-[var(--betanor-muted)]">Ask about Betanor services or products.</p>
      {messages.length ? <button type="button" className="text-[11px] font-semibold text-[var(--betanor-blue)] hover:underline" onClick={() => setMessages([])} disabled={sending}>New chat</button> : null}
    </div>
    <div className="min-h-36 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite" aria-relevant="additions text">
      {!messages.length ? <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3"><p className="text-sm font-semibold text-[var(--betanor-navy)]">Hello — how can I help?</p><p className="mt-1 text-xs leading-5 text-[var(--betanor-muted)]">I can explain published Betanor services and products. For account, ticket, pricing, or order details, switch to live support.</p><p className="mt-2 text-[10px] leading-4 text-[var(--betanor-muted)]">Messages are sent to OpenAI to generate replies and are not added to Betanor live-chat history. Do not include sensitive or account information.</p></div> : null}
      {messages.map((message) => {
        const text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
        if (!text) return null;
        return <div key={message.id} className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-6 ${message.role === "user" ? "ml-auto rounded-br-md bg-[var(--betanor-navy)] text-white" : "rounded-bl-md border border-[var(--betanor-border)] bg-white text-[var(--betanor-text)]"}`}>
          <p className="whitespace-pre-wrap break-words">{text}</p>
          <p className={`mt-1 text-[9px] font-semibold uppercase tracking-wide ${message.role === "user" ? "text-white/60" : "text-[var(--betanor-muted)]"}`}>{message.role === "user" ? "You" : "Betanor AI"}</p>
        </div>;
      })}
      {sending ? <p className="text-xs text-[var(--betanor-muted)]" role="status">Betanor AI is responding…</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">Betanor AI is temporarily unavailable. Please try again or switch to live support.</p> : null}
    </div>
    <form onSubmit={submit} className="border-t border-[var(--betanor-border)] p-3">
      <label htmlFor="customer-ai-question" className="sr-only">Message Betanor AI</label>
      <textarea id="customer-ai-question" value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} rows={2} placeholder="Ask about a service or product…" disabled={sending} className="w-full resize-y rounded-xl border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 py-2.5 text-sm text-[var(--betanor-field-text)] outline-none focus:border-[var(--betanor-field-focus)] focus:ring-2 focus:ring-blue-100 disabled:opacity-60" />
      <div className="mt-2 flex items-center justify-between gap-3"><p className="text-[10px] leading-4 text-[var(--betanor-muted)]">AI responses can be inaccurate. Avoid sensitive details.</p><Button type="submit" size="sm" disabled={sending || input.trim().length < 2}>{sending ? "Sending…" : "Send"}</Button></div>
    </form>
  </div>;
}
