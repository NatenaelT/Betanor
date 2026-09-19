"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function ChatRealtimeBridge({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`betanor-staff-chat-${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations", filter: `workspace_id=eq.${workspaceId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => router.refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router, workspaceId]);
  return null;
}
