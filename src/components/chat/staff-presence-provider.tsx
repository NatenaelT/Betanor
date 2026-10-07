"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { createClient } from "@/lib/supabase/client";

type PresenceContextValue = { onlineIds: ReadonlySet<string>; enabled: boolean };
const PresenceContext = createContext<PresenceContextValue>({ onlineIds: new Set(), enabled: false });
const EMPTY_PRESENCE = new Set<string>();

export function StaffPresenceProvider({ workspaceId, userId, enabled, children }: { workspaceId: string | null; userId: string | null; enabled: boolean; children: ReactNode }) {
  const [presence, setPresence] = useState<{ key: string; ids: Set<string> } | null>(null);
  const channelKey = enabled && workspaceId && userId ? `${workspaceId}:${userId}` : null;

  useEffect(() => {
    if (!enabled || !workspaceId || !userId) return;
    const supabase = createClient();
    const channel = supabase.channel(`workspace:${workspaceId}:staff-presence`, {
      config: { private: true, presence: { key: userId } },
    });
    channel.on("presence", { event: "sync" }, () => {
      setPresence({ key: `${workspaceId}:${userId}`, ids: new Set(Object.keys(channel.presenceState())) });
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({ actor_id: userId, online_at: new Date().toISOString() });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setPresence({ key: `${workspaceId}:${userId}`, ids: EMPTY_PRESENCE });
      }
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, workspaceId]);

  const onlineIds = channelKey && presence?.key === channelKey ? presence.ids : EMPTY_PRESENCE;
  const value = useMemo(() => ({ onlineIds, enabled: Boolean(channelKey) }), [channelKey, onlineIds]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function useStaffPresence() {
  return useContext(PresenceContext);
}
