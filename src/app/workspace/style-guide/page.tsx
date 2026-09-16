import { redirect } from "next/navigation";

import { ThemeSettingsPanel } from "@/components/admin/theme-settings-panel";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export default async function StyleGuidePage() {
  const access = await resolveWorkspace(await createClient());
  if (!access.roleCodes.has("SUPER_ADMIN")) redirect("/workspace");

  return <main className="mx-auto max-w-7xl space-y-8 px-6 py-10 lg:px-8">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Foundation / theme studio</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Brand & application themes</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--betanor-muted)]">Create reusable templates and control every presentation token shared by the Betanor public site, customer portal, and staff workspace.</p>
      </div>
      <Badge tone="info">Super Admin only</Badge>
    </div>
    <ThemeSettingsPanel />
  </main>;
}
