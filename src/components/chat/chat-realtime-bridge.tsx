"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function ChatRealtimeBridge({ workspaceId, conversationId }: { workspaceId: string; conversationId?: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let channel = supabase.channel(`betanor-staff-chat-${workspaceId}-${conversationId || "list"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations", filter: `workspace_id=eq.${workspaceId}` }, () => router.refresh());
    if (conversationId) {
      channel = channel
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` }, () => router.refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_message_pins", filter: `conversation_id=eq.${conversationId}` }, () => router.refresh());
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router, workspaceId, conversationId]);
  return null;
}
