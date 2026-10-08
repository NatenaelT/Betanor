"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { usePwaInstall } from "@/components/pwa/pwa-runtime";
import { createClient } from "@/lib/supabase/client";

type PresenceContextValue = { onlineIds: ReadonlySet<string>; enabled: boolean };
const PresenceContext = createContext<PresenceContextValue>({ onlineIds: new Set(), enabled: false });
const EMPTY_PRESENCE = new Set<string>();

export function StaffPresenceProvider({ workspaceId, userId, enabled, children }: { workspaceId: string | null; userId: string | null; enabled: boolean; children: ReactNode }) {
  const { lowDataMode } = usePwaInstall();
  const [presence, setPresence] = useState<{ key: string; ids: Set<string> } | null>(null);
  const channelKey = enabled && workspaceId && userId ? `${workspaceId}:${userId}` : null;

  useEffect(() => {
    if (!enabled || !workspaceId || !userId) return;
    const supabase = createClient();
    const key = `${workspaceId}:${userId}`;
    const onlineSince = () => new Date(Date.now() - 120_000).toISOString();
    const refreshPresence = async () => {
      const { data, error } = await supabase
        .from("chat_staff_presence")
        .select("profile_id")
        .eq("workspace_id", workspaceId)
        .gte("last_seen_at", onlineSince());
      if (!error) setPresence({ key, ids: new Set((data ?? []).map((entry) => entry.profile_id)) });
    };
    const heartbeat = async () => {
      const { error } = await supabase.rpc("heartbeat_chat_staff_presence");
      if (!error) await refreshPresence();
    };
    const channel = supabase.channel(`betanor-staff-presence-${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_staff_presence", filter: `workspace_id=eq.${workspaceId}` }, () => void refreshPresence())
      .subscribe();
    void heartbeat();
    const interval = window.setInterval(() => void heartbeat(), lowDataMode ? 90_000 : 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [enabled, lowDataMode, userId, workspaceId]);

  const onlineIds = channelKey && presence?.key === channelKey ? presence.ids : EMPTY_PRESENCE;
  const value = useMemo(() => ({ onlineIds, enabled: Boolean(channelKey) }), [channelKey, onlineIds]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function useStaffPresence() {
  return useContext(PresenceContext);
}
