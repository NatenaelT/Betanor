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

async function updateWorkspace(data: FormData) {
  "use server";
  const workspaceId = value(data, "workspaceId");
  if (!workspaceId) return;
  const supabase = await createClient();
  await supabase.from("workspaces").update({ name: value(data, "name"), legal_name: value(data, "legalName") || null, timezone: value(data, "timezone") || "Africa/Addis_Ababa", currency_code: value(data, "currencyCode") || "ETB", tin: value(data, "tin") || null, vat_registration_number: value(data, "vat") || null, registered_address: value(data, "address") || null }).eq("id", workspaceId);
  revalidatePath("/workspace"); revalidatePath("/workspace/admin/settings");
}

async function createDepartment(data: FormData) {
  "use server";
  const name = value(data, "departmentName"); const code = value(data, "departmentCode"); const workspaceId = value(data, "workspaceId");
  if (!name || !code || !workspaceId) return;
  const supabase = await createClient(); await supabase.from("departments").insert({ name, code: code.toUpperCase(), workspace_id: workspaceId }); revalidatePath("/workspace/admin/settings");
}

async function createPosition(data: FormData) {
  "use server";
  const title = value(data, "positionTitle"); const code = value(data, "positionCode"); const workspaceId = value(data, "workspaceId");
  if (!title || !workspaceId) return;
  const supabase = await createClient(); await supabase.from("positions").insert({ title, code: code ? code.toUpperCase() : null, workspace_id: workspaceId, department_id: value(data, "departmentId") || null }); revalidatePath("/workspace/admin/settings");
}

async function archiveDepartment(data: FormData) {
  "use server";
  const id = value(data, "id"); if (!id) return; const supabase = await createClient(); await supabase.from("departments").update({ status: "inactive" }).eq("id", id); revalidatePath("/workspace/admin/settings");
}

async function archivePosition(data: FormData) {
  "use server";
  const id = value(data, "id"); if (!id) return; const supabase = await createClient(); await supabase.from("positions").update({ status: "inactive" }).eq("id", id); revalidatePath("/workspace/admin/settings");
}

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("settings.manage")) redirect("/workspace");
  const [departments, positions] = await Promise.all([
    access.workspaceId ? supabase.from("departments").select("id,name,code,status").eq("workspace_id", access.workspaceId).order("name") : Promise.resolve({ data: [] as never[] }),
    access.workspaceId ? supabase.from("positions").select("id,title,code,status,department_id,departments(name)").eq("workspace_id", access.workspaceId).order("title") : Promise.resolve({ data: [] as never[] }),
  ]);
  const workspace = access.workspace;
  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Administration</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Workspace configuration</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Keep legal identity, Ethiopian tax references, operating structure, and display settings in one controlled place.</p></div><Badge tone="info">Admin protected</Badge></div>
    {workspace ? <Card className="mt-8 p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Legal and regional settings</h2><form action={updateWorkspace} className="mt-5 grid gap-4 md:grid-cols-2"><input type="hidden" name="workspaceId" value={workspace.id}/><div><FieldLabel htmlFor="workspace-name">Display name</FieldLabel><Input id="workspace-name" name="name" defaultValue={workspace.name}/></div><div><FieldLabel htmlFor="workspace-legal">Legal name</FieldLabel><Input id="workspace-legal" name="legalName" defaultValue={workspace.legal_name ?? ""}/></div><div><FieldLabel htmlFor="workspace-tin">TIN</FieldLabel><Input id="workspace-tin" name="tin" defaultValue={workspace.tin ?? ""}/></div><div><FieldLabel htmlFor="workspace-vat">VAT registration number</FieldLabel><Input id="workspace-vat" name="vat" defaultValue={workspace.vat_registration_number ?? ""}/></div><div><FieldLabel htmlFor="workspace-currency">Currency</FieldLabel><Input id="workspace-currency" name="currencyCode" defaultValue={workspace.currency_code ?? "ETB"}/></div><div><FieldLabel htmlFor="workspace-timezone">Timezone</FieldLabel><Input id="workspace-timezone" name="timezone" defaultValue={workspace.timezone ?? "Africa/Addis_Ababa"}/></div><div className="md:col-span-2"><FieldLabel htmlFor="workspace-address">Registered address</FieldLabel><Input id="workspace-address" name="address" defaultValue={workspace.registered_address ?? ""}/></div><div className="md:col-span-2"><Button type="submit">Save configuration</Button></div></form></Card> : <Card className="mt-8 p-6">No workspace is assigned to this administrator.</Card>}
    {access.workspaceId ? <div className="mt-8 grid gap-6 xl:grid-cols-2"><Card className="p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Departments</h2><form action={createDepartment} className="mt-5 grid gap-3 sm:grid-cols-[1fr_140px_auto]"><input type="hidden" name="workspaceId" value={access.workspaceId}/><Input name="departmentName" required placeholder="Department name"/><Input name="departmentCode" required placeholder="Code"/><Button type="submit">Add</Button></form><div className="mt-5 divide-y divide-[var(--betanor-border)]">{departments.data?.map((department) => <div key={department.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-[var(--betanor-navy)]">{department.name}</p><p className="text-xs text-[var(--betanor-muted)]">{department.code}</p></div><div className="flex items-center gap-2"><Badge tone={department.status === "active" ? "success" : "neutral"}>{department.status}</Badge>{department.status === "active" ? <form action={archiveDepartment}><input type="hidden" name="id" value={department.id}/><Button type="submit" size="sm" variant="outline">Deactivate</Button></form> : null}</div></div>)}</div></Card><Card className="p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Positions</h2><form action={createPosition} className="mt-5 grid gap-3 sm:grid-cols-[1fr_140px_auto]"><input type="hidden" name="workspaceId" value={access.workspaceId}/><Input name="positionTitle" required placeholder="Position title"/><Input name="positionCode" placeholder="Code"/><Button type="submit">Add</Button></form><div className="mt-5 divide-y divide-[var(--betanor-border)]">{positions.data?.map((position) => { const department = Array.isArray(position.departments) ? position.departments[0] : position.departments; return <div key={position.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-[var(--betanor-navy)]">{position.title}</p><p className="text-xs text-[var(--betanor-muted)]">{position.code || "No code"}{department?.name ? ` · ${department.name}` : ""}</p></div><div className="flex items-center gap-2"><Badge tone={position.status === "active" ? "success" : "neutral"}>{position.status}</Badge>{position.status === "active" ? <form action={archivePosition}><input type="hidden" name="id" value={position.id}/><Button type="submit" size="sm" variant="outline">Deactivate</Button></form> : null}</div></div>; })}</div></Card></div> : null}
    <Card className="mt-8 border-blue-100 bg-blue-50/50 p-5"><p className="text-sm font-semibold text-[var(--betanor-navy)]">Configuration principles</p><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">ETB is the default accounting currency and Africa/Addis_Ababa is the default timezone. Deactivating a department or position preserves employee and payroll history. Publish customer-facing changes from Content management and Product catalogue.</p></Card>
  </main>;
}
