import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { WorkspaceSidebar } from "@/components/navigation/workspace-sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: jwt,
  } = await supabase.auth.getClaims();

  if (!jwt?.claims.sub) redirect("/login");

  return (
    <div className="flex min-h-screen bg-[var(--betanor-surface)]">
      <WorkspaceSidebar />
      <div className="min-w-0 flex-1">
        <header className="flex min-h-16 items-center justify-between border-b border-[var(--betanor-border)] bg-white px-6 pl-18 lg:px-8">
          <p className="text-sm font-medium text-[var(--betanor-muted)]">Betanor Workspace</p>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-[var(--betanor-navy)]">Foundation</span>
        </header>
        {children}
      </div>
    </div>
  );
}
