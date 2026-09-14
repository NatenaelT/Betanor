import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "@/lib/env";

export function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } =
    getSupabasePublicConfig();

  return createBrowserClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
