"use client";

import { useEffect, useRef } from "react";

import { ChatMessage, type ChatMessageRecord } from "@/components/chat/chat-message";

export function ChatMessageList({ messages, viewerId, canPin = false, conversationId }: { messages: ChatMessageRecord[]; viewerId: string | null; canPin?: boolean; conversationId?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lastId]);
  return <div ref={scrollRef} className="flex min-h-72 flex-1 flex-col gap-3 overflow-y-auto bg-[#f8fafc] px-3 py-5 sm:px-6" aria-label="Messages">
    {messages.length ? messages.map((message) => <ChatMessage key={message.id} message={message} viewerId={viewerId} canPin={canPin} conversationId={conversationId} />) : <p className="m-auto text-sm text-[var(--betanor-muted)]">No messages yet.</p>}
    {messages.length === 100 ? <p className="text-center text-xs text-[var(--betanor-muted)]">Showing the latest 100 messages.</p> : null}
  </div>;
}
