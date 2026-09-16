import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DepartmentPositionManager } from "@/components/admin/department-position-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";
function value(data: FormData, key: string) { return String(data.get(key) ?? "").trim(); }

async function updateWorkspace(data: FormData) {
  "use server";
  const workspaceId = value(data, "workspaceId");
  if (!workspaceId) return;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("settings.manage") || access.workspaceId !== workspaceId) return;
  await supabase.from("workspaces").update({ name: value(data, "name"), legal_name: value(data, "legalName") || null, timezone: value(data, "timezone") || "Africa/Addis_Ababa", currency_code: value(data, "currencyCode") || "ETB", tin: value(data, "tin") || null, vat_registration_number: value(data, "vat") || null, registered_address: value(data, "address") || null }).eq("id", workspaceId);
  revalidatePath("/workspace");
  revalidatePath("/workspace/admin/settings");
}

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("settings.manage")) redirect("/workspace");
  const workspace = access.workspace;
  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Administration</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Workspace configuration</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Keep legal identity, Ethiopian tax references, operating structure, and display settings in one controlled place.</p></div><div className="flex flex-wrap gap-2"><Badge tone="info">Admin protected</Badge>{access.roleCodes.has("SUPER_ADMIN") ? <a href="/workspace/style-guide" className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-blue)]">Brand style</a> : null}</div></div>
    {workspace ? <Card className="mt-8 p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Legal and regional settings</h2><form action={updateWorkspace} className="mt-5 grid gap-4 md:grid-cols-2"><input type="hidden" name="workspaceId" value={workspace.id}/><div><FieldLabel htmlFor="workspace-name">Display name</FieldLabel><Input id="workspace-name" name="name" defaultValue={workspace.name}/></div><div><FieldLabel htmlFor="workspace-legal">Legal name</FieldLabel><Input id="workspace-legal" name="legalName" defaultValue={workspace.legal_name ?? ""}/></div><div><FieldLabel htmlFor="workspace-tin">TIN</FieldLabel><Input id="workspace-tin" name="tin" defaultValue={workspace.tin ?? ""}/></div><div><FieldLabel htmlFor="workspace-vat">VAT registration number</FieldLabel><Input id="workspace-vat" name="vat" defaultValue={workspace.vat_registration_number ?? ""}/></div><div><FieldLabel htmlFor="workspace-currency">Currency</FieldLabel><Input id="workspace-currency" name="currencyCode" defaultValue={workspace.currency_code ?? "ETB"}/></div><div><FieldLabel htmlFor="workspace-timezone">Timezone</FieldLabel><Input id="workspace-timezone" name="timezone" defaultValue={workspace.timezone ?? "Africa/Addis_Ababa"}/></div><div className="md:col-span-2"><FieldLabel htmlFor="workspace-address">Registered address</FieldLabel><Input id="workspace-address" name="address" defaultValue={workspace.registered_address ?? ""}/></div><div className="md:col-span-2"><Button type="submit">Save configuration</Button></div></form></Card> : <Card className="mt-8 p-6">No workspace is assigned to this administrator.</Card>}
    {access.workspaceId ? <DepartmentPositionManager /> : null}
    <Card className="mt-8 border-blue-100 bg-blue-50/50 p-5"><p className="text-sm font-semibold text-[var(--betanor-navy)]">Configuration principles</p><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">ETB is the default accounting currency and Africa/Addis_Ababa is the default timezone. Records in use by employees, payroll, finance, goals, or recruitment cannot be hard-deleted; set them inactive to preserve audit history.</p></Card>
  </main>;
}
