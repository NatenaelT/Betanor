import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const metadata = { title: "Programmer guide" };

const guideTopics = [
  ["Product and repository map", "Platform scope, technology stack, source layout, and the current-versus-planned distinction."],
  ["Data and business domains", "Canonical CRM, sales, delivery, people, finance, strategy, tender, and platform relationships."],
  ["Identity and security", "Supabase Auth, RBAC, RLS, private Storage, audit expectations, and safe account provisioning."],
  ["Migrations and operations", "Schema change approach, local development, configuration boundaries, and deployment checks."],
  ["Programmer change checklist", "A practical checklist for extending a module without bypassing permissions, workflows, or retained history."],
] as const;

export default async function ProgrammerGuidePage() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  const canManage = access.permissions.has("users.manage") || access.permissions.has("settings.manage") || access.roleCodes.has("SUPER_ADMIN");
  if (!access.userId || !access.isActive || !access.hasStaffRole || !canManage) redirect("/workspace");

  return <main className="mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Administration · Technical documentation</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Betanor programmer guide</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">A developer-facing guide based on the supplied master specification and the current repository. It distinguishes implemented capabilities from planned work.</p></div><a href="/api/admin/guides/programmer" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--betanor-button-bg)] px-5 text-sm font-semibold text-[var(--betanor-button-text)] shadow-sm hover:opacity-90">Download programmer guide</a></div>
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Documentation status:</strong> the guide is an engineering reference, not a guarantee that every item in the master specification is live. Verify current code, migrations, permissions, and deployment state before relying on a capability.</div>
    <div className="mt-8 grid gap-4 sm:grid-cols-2">{guideTopics.map(([title, description]) => <Card key={title} className="p-5"><h2 className="font-semibold text-[var(--betanor-navy)]">{title}</h2><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">{description}</p></Card>)}</div>
    <Card className="mt-6 p-5 sm:p-6"><h2 className="font-semibold text-[var(--betanor-navy)]">Maintained architecture records</h2><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">Use the repository documentation as the working reference for individual architecture decisions.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{[["Architecture", "ARCHITECTURE.md"], ["Database & conceptual ERD", "DATABASE.md"], ["Permissions & RLS", "PERMISSIONS.md"], ["Routes", "ROUTES.md"], ["Workflows", "WORKFLOWS.md"], ["Implementation plan", "IMPLEMENTATION_PLAN.md"]].map(([label, file]) => <div key={file} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-3 text-sm"><span className="font-medium text-[var(--betanor-navy)]">{label}</span><code className="text-xs text-[var(--betanor-muted)]">docs/{file}</code></div>)}</div></Card>
    <div className="mt-6"><Link href="/workspace/help" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Open role-based user manual →</Link></div>
  </main>;
}
