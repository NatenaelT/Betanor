"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function ChatRealtimeBridge({ workspaceId, conversationId }: { workspaceId: string; conversationId?: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`betanor-staff-chat-${workspaceId}-${conversationId || "list"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations", filter: `workspace_id=eq.${workspaceId}` }, (payload) => {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<string, unknown>;
        // A message in the open thread also updates its conversation timestamp.
        // The message list handles that event locally, so only refresh the inbox
        // when a different conversation moves or changes.
        if (conversationId && row.id === conversationId) return;
        router.refresh();
      });
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router, workspaceId, conversationId]);
  return null;
}
