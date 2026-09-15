import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveWorkspace(supabase: SupabaseClient) {
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  const { data: profile } = userId
    ? await supabase.from("profiles").select("workspace_id").eq("id", userId).maybeSingle()
    : { data: null };
  const workspaceQuery = profile?.workspace_id
    ? supabase.from("workspaces").select("id,name,currency_code,tin,vat_registration_number,registered_address").eq("id", profile.workspace_id).maybeSingle()
    : supabase.from("workspaces").select("id,name,currency_code,tin,vat_registration_number,registered_address").limit(1).maybeSingle();
  const { data: workspace } = await workspaceQuery;
  const workspaceId = workspace?.id ?? null;
  return { userId, workspaceId, workspace };
}
