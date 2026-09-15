import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { WorkspaceSidebar } from "@/components/navigation/workspace-sidebar";
import { WorkspaceTopbar } from "@/components/navigation/workspace-topbar";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: jwt,
  } = await supabase.auth.getClaims();

  if (!jwt?.claims.sub) redirect("/login");
  const email = typeof jwt.claims.email === "string" ? jwt.claims.email : "";

  return (
    <div className="flex min-h-screen bg-[var(--betanor-surface)]">
      <WorkspaceSidebar />
      <div className="min-w-0 flex-1">
        <WorkspaceTopbar email={email} />
        {children}
      </div>
    </div>
  );
}
