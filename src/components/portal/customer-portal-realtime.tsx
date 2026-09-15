"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function CustomerPortalRealtime({ customerId }: { customerId?: string | null }) {
  const router = useRouter();
  useEffect(() => {
    if (!customerId) return;
    const supabase = createClient();
    const channel = supabase.channel(`customer-portal-${customerId}`);
    const tables = ["rfq_requests", "quotations", "contracts", "projects", "invoices"] as const;
    for (const table of tables) channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `customer_id=eq.${customerId}` }, () => router.refresh());
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [customerId, router]);
  return null;
}
