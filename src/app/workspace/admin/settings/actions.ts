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
  const { error } = await supabase.from("workspace_navigation_settings").upsert({
    workspace_id: workspaceId,
    staff_navigation: settings.staff,
    customer_navigation: settings.customer,
    updated_by: access.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id" });
  if (error) return { success: false, error: "Navigation settings could not be saved. Please retry." };

  updateTag("betanor-public-navigation-settings");
  revalidatePath("/workspace", "layout");
  revalidatePath("/portal", "layout");
  revalidatePath("/workspace/admin/settings");
  return { success: true };
}
