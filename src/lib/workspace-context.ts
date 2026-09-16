import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveWorkspace(supabase: SupabaseClient) {
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  const { data: profile } = userId
    ? await supabase.from("profiles").select("workspace_id,account_type,is_active").eq("id", userId).maybeSingle()
    : { data: null };
  const workspaceQuery = profile?.workspace_id
    ? supabase.from("workspaces").select("id,name,legal_name,timezone,currency_code,tin,vat_registration_number,registered_address").eq("id", profile.workspace_id).maybeSingle()
    : supabase.from("workspaces").select("id,name,legal_name,timezone,currency_code,tin,vat_registration_number,registered_address").limit(1).maybeSingle();
  const { data: workspace } = await workspaceQuery;
  const workspaceId = workspace?.id ?? null;
  const permissions = new Set<string>();
  const roleCodes = new Set<string>();
  let hasStaffRole = false;
  if (userId) {
    const { data: roleRows } = await supabase.from("user_roles").select("role_id,roles(code,role_type)").eq("user_id", userId);
    const roleIds = (roleRows ?? []).map((row) => row.role_id).filter(Boolean);
    (roleRows ?? []).forEach((row) => {
      const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      if (role?.role_type === "staff") hasStaffRole = true;
      if (role?.code && role.role_type !== "customer") roleCodes.add(role.code);
    });
    if (roleIds.length) {
      const { data: rolePermissionRows } = await supabase.from("role_permissions").select("permission_id").in("role_id", roleIds);
      const permissionIds = (rolePermissionRows ?? []).map((row) => row.permission_id).filter(Boolean);
      if (permissionIds.length) {
        const { data: permissionRows } = await supabase.from("permissions").select("id,code").in("id", permissionIds);
        permissionRows?.forEach((permission) => permissions.add(permission.code));
      }
    }
    const { data: overrides } = await supabase.from("user_permissions").select("is_allowed,permissions(code)").eq("user_id", userId);
    for (const override of overrides ?? []) {
      const relation = override.permissions as unknown as { code?: string } | { code?: string }[] | null;
      const code = Array.isArray(relation) ? relation[0]?.code : relation?.code;
      if (code) {
        if (override.is_allowed) permissions.add(code);
        else permissions.delete(code);
      }
    }
  }
  return { userId, workspaceId, workspace, permissions, roleCodes, hasStaffRole, accountType: profile?.account_type ?? "staff", isActive: profile?.is_active !== false };
}
