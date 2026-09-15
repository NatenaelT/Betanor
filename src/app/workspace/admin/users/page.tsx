import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function value(data: FormData, key: string) { return String(data.get(key) ?? "").trim(); }

async function saveAccess(data: FormData) {
  "use server";
  const userId = value(data, "userId");
  const roleCode = value(data, "roleCode");
  if (!userId || !roleCode) return;
  const supabase = await createClient();
  const { userId: actorId, workspaceId } = await resolveWorkspace(supabase);
  if (!actorId || !workspaceId) return;
  const { data: role } = await supabase.from("roles").select("id").eq("code", roleCode).is("workspace_id", null).maybeSingle();
  if (!role?.id) return;
  const { error: profileError } = await supabase.rpc("admin_upsert_profile", { target_user_id: userId, target_workspace_id: workspaceId, target_full_name: value(data, "fullName") || null, target_job_title: value(data, "jobTitle") || null, target_is_active: true });
  if (profileError) return;
  await supabase.from("user_roles").delete().eq("user_id", userId);
  await supabase.from("user_roles").insert({ user_id: userId, role_id: role.id, assigned_by: actorId });
  revalidatePath("/workspace/admin/users");
}

async function deactivateUser(data: FormData) {
  "use server";
  const userId = value(data, "userId");
  const supabase = await createClient();
  const { userId: actorId } = await resolveWorkspace(supabase);
  if (!userId || userId === actorId) return;
  await supabase.rpc("admin_deactivate_profile", { target_user_id: userId });
  revalidatePath("/workspace/admin/users");
}

async function savePortalAccess(data: FormData) {
  "use server";
  const profileId = value(data, "portalProfileId");
  const customerId = value(data, "customerId");
  if (!profileId || !customerId) return;
  const supabase = await createClient();
  const { workspaceId } = await resolveWorkspace(supabase);
  if (!workspaceId) return;
  await supabase.from("customer_portal_access").upsert({ profile_id: profileId, customer_id: customerId, workspace_id: workspaceId, access_level: value(data, "accessLevel") || "customer_viewer", is_active: true }, { onConflict: "customer_id,profile_id" });
  revalidatePath("/workspace/admin/users");
}

async function revokePortalAccess(data: FormData) {
  "use server";
  const accessId = value(data, "accessId");
  if (!accessId) return;
  const supabase = await createClient();
  await supabase.from("customer_portal_access").update({ is_active: false }).eq("id", accessId);
  revalidatePath("/workspace/admin/users");
}

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("users.manage")) redirect("/workspace");
  const [profiles, roles, customers, portalAccess] = await Promise.all([
    supabase.from("profiles").select("id,full_name,job_title,is_active,workspace_id").order("full_name"),
    supabase.from("roles").select("id,code,name").is("workspace_id", null).order("name"),
    access.workspaceId ? supabase.from("customers").select("id,name,legal_name").eq("workspace_id", access.workspaceId).order("name") : Promise.resolve({ data: [] as never[] }),
    access.workspaceId ? supabase.from("customer_portal_access").select("id,profile_id,customer_id,access_level,is_active,customers(name),profiles(full_name)").eq("workspace_id", access.workspaceId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as never[] }),
  ]);
  const roleAssignments = new Map<string, { code: string; name: string }>();
  for (const profile of profiles.data ?? []) {
    const { data: assignments } = await supabase.from("user_roles").select("roles(code,name)").eq("user_id", profile.id).limit(1);
    const role = assignments?.[0]?.roles;
    if (role) roleAssignments.set(profile.id, Array.isArray(role) ? role[0] : role);
  }

  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Administration</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Users & access</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Control staff roles and customer portal access without exposing Supabase Auth administration to the browser.</p></div><Badge tone="info">Super admin protected</Badge></div>
    <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
      <Card className="p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Create or update staff access</h2><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">Paste the UUID of an existing Supabase Auth user. The platform creates or updates their application profile and assigns one role.</p><form action={saveAccess} className="mt-5 grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><FieldLabel htmlFor="access-user">Auth user UUID</FieldLabel><Input id="access-user" name="userId" required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></div><div><FieldLabel htmlFor="access-name">Full name</FieldLabel><Input id="access-name" name="fullName" /></div><div><FieldLabel htmlFor="access-title">Job title</FieldLabel><Input id="access-title" name="jobTitle" /></div><div className="sm:col-span-2"><FieldLabel htmlFor="access-role">Role</FieldLabel><select id="access-role" name="roleCode" required className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm">{roles.data?.map((role) => <option key={role.id} value={role.code}>{role.name}</option>)}</select></div><div className="sm:col-span-2"><Button type="submit">Save staff access</Button></div></form></Card>
      <Card className="p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Link a customer portal user</h2><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">A customer user must already have a Supabase Auth identity. Their portal only returns records for the selected customer.</p><form action={savePortalAccess} className="mt-5 grid gap-4"><div><FieldLabel htmlFor="portal-profile">Profile UUID</FieldLabel><Input id="portal-profile" name="portalProfileId" required /></div><div><FieldLabel htmlFor="portal-customer">Customer</FieldLabel><select id="portal-customer" name="customerId" required className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Select customer</option>{customers.data?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div><div><FieldLabel htmlFor="portal-level">Access level</FieldLabel><select id="portal-level" name="accessLevel" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="customer_viewer">Customer viewer</option><option value="customer_admin">Customer admin</option></select></div><Button type="submit">Save portal link</Button></form></Card>
    </div>
    <Card className="mt-8 overflow-hidden"><div className="border-b border-[var(--betanor-border)] px-5 py-4"><h2 className="font-semibold text-[var(--betanor-navy)]">Staff directory</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">{profiles.data?.length ?? 0} application profiles. Deactivation preserves audit history.</p></div><div className="divide-y divide-[var(--betanor-border)]">{profiles.data?.map((profile) => { const role = roleAssignments.get(profile.id); return <div key={profile.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{profile.full_name || "Unnamed profile"}</p><p className="mt-1 truncate text-xs text-[var(--betanor-muted)]">{profile.id} · {profile.job_title || "Title not set"}</p></div><div className="flex items-center gap-3"><Badge tone={profile.is_active ? "success" : "neutral"}>{profile.is_active ? "Active" : "Inactive"}</Badge><Badge tone="info">{role?.name || "No role"}</Badge>{profile.is_active ? <form action={deactivateUser}><input type="hidden" name="userId" value={profile.id}/><Button type="submit" variant="outline" size="sm">Deactivate</Button></form> : null}</div></div>; })}</div></Card>
    <Card className="mt-8 overflow-hidden"><div className="border-b border-[var(--betanor-border)] px-5 py-4"><h2 className="font-semibold text-[var(--betanor-navy)]">Customer portal links</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">Revoke access without deleting the customer&apos;s commercial history.</p></div><div className="divide-y divide-[var(--betanor-border)]">{portalAccess.data?.length ? portalAccess.data.map((link) => { const customer = Array.isArray(link.customers) ? link.customers[0] : link.customers; const profile = Array.isArray(link.profiles) ? link.profiles[0] : link.profiles; return <div key={link.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-[var(--betanor-navy)]">{customer?.name || "Customer"}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">{profile?.full_name || link.profile_id} · {link.access_level}</p></div><div className="flex items-center gap-3"><Badge tone={link.is_active ? "success" : "neutral"}>{link.is_active ? "Active" : "Revoked"}</Badge>{link.is_active ? <form action={revokePortalAccess}><input type="hidden" name="accessId" value={link.id}/><Button type="submit" variant="outline" size="sm">Revoke</Button></form> : null}</div></div>; }) : <p className="px-5 py-8 text-sm text-[var(--betanor-muted)]">No customer portal links yet.</p>}</div></Card>
  </main>;
}
