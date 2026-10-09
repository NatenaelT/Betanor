"use server";

import { revalidatePath, updateTag } from "next/cache";

import { normalizeNavigationSettings } from "@/lib/navigation-settings";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export async function saveNavigationSettings(data: FormData): Promise<{ success: boolean; error?: string }> {
  const workspaceId = String(data.get("workspaceId") ?? "").trim();
  if (!workspaceId) return { success: false, error: "Workspace not found. Reload and try again." };

  let staff: unknown;
  let customer: unknown;
  try {
    staff = JSON.parse(String(data.get("staffNavigation") ?? ""));
    customer = JSON.parse(String(data.get("customerNavigation") ?? ""));
  } catch {
    return { success: false, error: "The navigation settings are invalid. Review them and save again." };
  }

  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.isActive || !access.permissions.has("settings.manage") || access.workspaceId !== workspaceId) {
    return { success: false, error: "You are not authorized to update workspace navigation." };
  }

  const settings = normalizeNavigationSettings({ staff, customer });
  const values = {
    staff_navigation: settings.staff,
    customer_navigation: settings.customer,
    updated_by: access.userId,
    updated_at: new Date().toISOString(),
  };

  function reportSaveError(operation: "read" | "insert" | "update", error: { code?: string; message: string; details?: string | null; hint?: string | null }) {
    console.error("[workspace-navigation] save failed", {
      operation,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (error.code === "42501") {
      return { success: false as const, error: "The database denied this save. Confirm your account has System Configuration access, then reload and try again." };
    }
    return { success: false as const, error: "Navigation could not be saved. Check your connection, reload System Configuration, and try again." };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("workspace_navigation_settings")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (lookupError) return reportSaveError("read", lookupError);

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from("workspace_navigation_settings")
      .update(values)
      .eq("workspace_id", workspaceId)
      .select("workspace_id")
      .maybeSingle();
    if (updateError) return reportSaveError("update", updateError);
    if (!updated) return { success: false, error: "No settings row was updated. Confirm your account has System Configuration access, then reload and try again." };
  } else {
    const { error: insertError } = await supabase
      .from("workspace_navigation_settings")
      .insert({ workspace_id: workspaceId, ...values });

    // A concurrent first save can win the unique workspace key. In that case,
    // retry as an update without exposing the hidden audit columns to SELECT.
    if (insertError?.code === "23505") {
      const { data: updated, error: updateError } = await supabase
        .from("workspace_navigation_settings")
        .update(values)
        .eq("workspace_id", workspaceId)
        .select("workspace_id")
        .maybeSingle();
      if (updateError) return reportSaveError("update", updateError);
      if (!updated) return { success: false, error: "Navigation settings changed at the same time. Reload and save again." };
    } else if (insertError) {
      return reportSaveError("insert", insertError);
    }
  }

  updateTag("betanor-public-navigation-settings");
  revalidatePath("/workspace", "layout");
  revalidatePath("/portal", "layout");
  revalidatePath("/workspace/admin/settings");
  return { success: true };
}
