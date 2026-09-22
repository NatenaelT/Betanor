import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { WorkspaceSidebar } from "@/components/navigation/workspace-sidebar";
import { WorkspaceTopbar } from "@/components/navigation/workspace-topbar";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: jwt,
  } = await supabase.auth.getClaims();

  if (!jwt?.claims.sub) redirect("/login");
  const email = typeof jwt.claims.email === "string" ? jwt.claims.email : "";
  const access = await resolveWorkspace(supabase);
  // Role assignments are authoritative. The profile account_type is kept as a
  // routing hint for legacy records, but a stale customer value must not lock
  // an administrator or staff member out after a role change.
  if (!access.isActive || (!access.hasStaffRole && access.accountType === "customer") || access.roleCodes.size === 0) {
    redirect(access.accountType === "customer" ? "/portal" : "/login?next=/workspace");
  }

  const { data: profile } = access.userId ? await supabase.from("profiles").select("full_name,avatar_path").eq("id", access.userId).maybeSingle() : { data: null };
  const avatarUrl = profile?.avatar_path ? (await supabase.storage.from("betanor-profile-avatars").createSignedUrl(profile.avatar_path, 900)).data?.signedUrl : null;
  return (
    <div className="flex min-h-screen bg-[var(--betanor-surface)]">
      <WorkspaceSidebar permissionCodes={[...access.permissions]} roleCodes={[...access.roleCodes]} />
      <div className="min-w-0 flex-1">
        <WorkspaceTopbar email={email} displayName={profile?.full_name} avatarUrl={avatarUrl} />
        {children}
      </div>
    </div>
  );
}
