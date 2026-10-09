"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function ChatRealtimeBridge({ workspaceId, conversationId }: { workspaceId: string; conversationId?: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let connectedOnce = false;
    const refreshInbox = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 120);
    };
    const channel = supabase.channel(`betanor-staff-chat-${workspaceId}-${conversationId || "list"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations", filter: `workspace_id=eq.${workspaceId}` }, refreshInbox)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (connectedOnce) refreshInbox();
          connectedOnce = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          connectedOnce = false;
        }
      });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [router, workspaceId, conversationId]);
  return null;
}
