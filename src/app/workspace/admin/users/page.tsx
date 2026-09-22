import Link from "next/link";
import { redirect } from "next/navigation";

import { CustomerPortalAccessPanel } from "@/components/admin/customer-portal-access-panel";
import { UserManagementPanel } from "@/components/admin/user-management-panel";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

type Role = { id: string; code: string; name: string; description: string | null; role_type: "staff" | "customer" };
type Permission = { id: string; code: string; module: string; description: string };

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("users.manage")) redirect("/workspace");

  const [{ data: roles }, { data: permissions }, { data: rolePermissionRows }] = await Promise.all([
    supabase.from("roles").select("id,code,name,description,role_type").is("workspace_id", null).order("role_type").order("name"),
    supabase.from("permissions").select("id,code,module,description").order("module").order("code"),
    supabase.from("role_permissions").select("role_id,permissions(code)"),
  ]);

  const rolePermissionCodes: Record<string, string[]> = {};
  for (const row of rolePermissionRows ?? []) {
    const relation = row.permissions as unknown as { code?: string } | { code?: string }[] | null;
    const permission = Array.isArray(relation) ? relation[0] : relation;
    const role = (roles ?? []).find((candidate) => candidate.id === row.role_id);
    if (role && permission?.code) rolePermissionCodes[role.code] = [...(rolePermissionCodes[role.code] ?? []), permission.code];
  }

  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Administration</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Users & access</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Create, update, and revoke staff and customer identities from one audited control panel. Roles are separated by account type and capabilities can be switched on or off per user.</p></div><div className="flex flex-wrap items-center gap-3"><Link href="/workspace/employees" className="rounded-lg bg-[var(--betanor-navy)] px-4 py-2.5 text-sm font-semibold text-white">Employee records</Link><Badge tone="info">Users.manage protected</Badge></div></div>
    <UserManagementPanel roles={(roles ?? []) as Role[]} permissions={(permissions ?? []) as Permission[]} rolePermissions={rolePermissionCodes} />
    <CustomerPortalAccessPanel />
  </main>;
}
