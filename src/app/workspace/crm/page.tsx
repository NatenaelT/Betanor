import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function text(data: FormData, key: string) { return String(data.get(key) ?? "").trim(); }

async function createCustomer(data: FormData) {
  "use server";
  const workspaceId = text(data, "workspaceId"); const name = text(data, "name");
  if (!workspaceId || !name) return;
  const supabase = await createClient();
  await supabase.from("customers").insert({ workspace_id: workspaceId, name, legal_name: text(data, "legalName") || null, email: text(data, "email") || null, phone: text(data, "phone") || null, status: "active" });
  revalidatePath("/workspace/crm");
}

async function createLead(data: FormData) {
  "use server";
  const workspaceId = text(data, "workspaceId"); const title = text(data, "title");
  if (!workspaceId || !title) return;
  const supabase = await createClient();
  await supabase.from("leads").insert({ workspace_id: workspaceId, customer_id: text(data, "customerId") || null, source: text(data, "source") || "direct", title, description: text(data, "description") || null, status: "submitted", priority: "medium", estimated_value: Number(text(data, "estimatedValue")) || null, currency_code: "ETB" });
  revalidatePath("/workspace/crm");
}

async function createContact(data: FormData) {
  "use server";
  const customerId = text(data, "customerId"); const firstName = text(data, "firstName");
  if (!customerId || !firstName) return;
  const supabase = await createClient();
  await supabase.from("customer_contacts").insert({ customer_id: customerId, first_name: firstName, last_name: text(data, "lastName") || "—", title: text(data, "title") || null, email: text(data, "email") || null, phone: text(data, "phone") || null });
  revalidatePath("/workspace/crm");
}

export default async function CrmPage() {
  const supabase = await createClient();
  const [workspaces, customers, leads, opportunities] = await Promise.all([
    supabase.from("workspaces").select("id, name").order("name"),
    supabase.from("customers").select("id, name, email, phone, status, created_at").order("created_at", { ascending: false }).limit(12),
    supabase.from("leads").select("id, title, source, status, priority, estimated_value, customers(name)").order("created_at", { ascending: false }).limit(12),
    supabase.from("opportunities").select("id, title, stage, expected_value, currency_code, customers(name)").order("created_at", { ascending: false }).limit(12),
  ]);
  const workspace = workspaces.data?.[0];
  const canRead = !customers.error && !leads.error && !opportunities.error;

  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">CRM</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Client relationships, in context.</h1><p className="mt-3 max-w-2xl text-base leading-7 text-[var(--betanor-muted)]">Capture customers, contacts, leads, opportunities, and their next commercial action in one protected workspace.</p></div><Badge tone="info">Workspace-scoped</Badge></div>{!canRead || !workspace ? <Card className="mt-8 p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">CRM access is required</h2><p className="mt-2 text-sm text-[var(--betanor-muted)]">Ask an administrator to assign CRM access to your account.</p></Card> : <><div className="mt-8 grid gap-5 xl:grid-cols-3"><Card className="p-5"><h2 className="font-semibold text-[var(--betanor-navy)]">New customer</h2><form action={createCustomer} className="mt-4 grid gap-3"><input type="hidden" name="workspaceId" value={workspace.id} /><Input name="name" required placeholder="Organization name" /><Input name="legalName" placeholder="Legal name" /><Input name="email" type="email" placeholder="Email" /><Input name="phone" placeholder="Phone" /><Button type="submit">Save customer</Button></form></Card><Card className="p-5"><h2 className="font-semibold text-[var(--betanor-navy)]">New lead</h2><form action={createLead} className="mt-4 grid gap-3"><input type="hidden" name="workspaceId" value={workspace.id} /><Input name="title" required placeholder="Lead title" /><Input name="source" placeholder="Source" /><select name="customerId" className="min-h-10 rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No customer linked</option>{customers.data?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><Input name="estimatedValue" type="number" min="0" placeholder="Estimated value (ETB)" /><textarea name="description" rows={2} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="Requirement or context" /><Button type="submit">Save lead</Button></form></Card><Card className="p-5"><h2 className="font-semibold text-[var(--betanor-navy)]">New contact</h2><form action={createContact} className="mt-4 grid gap-3"><select name="customerId" required className="min-h-10 rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Choose customer</option>{customers.data?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><Input name="firstName" required placeholder="First name" /><Input name="lastName" placeholder="Last name" /><Input name="title" placeholder="Role / title" /><Input name="email" type="email" placeholder="Email" /><Button type="submit">Save contact</Button></form></Card></div><div className="mt-8 grid gap-5 xl:grid-cols-3"><CrmList title="Customers" empty="No customers have been added." rows={customers.data?.map((item) => ({ title: item.name, meta: [item.email, item.phone].filter(Boolean).join(" · "), status: item.status })) ?? []} /><CrmList title="Leads" empty="No leads have been added." rows={leads.data?.map((item) => ({ title: item.title, meta: [item.customers?.[0]?.name, item.source, item.estimated_value ? `ETB ${item.estimated_value}` : null].filter(Boolean).join(" · "), status: item.status })) ?? []} /><CrmList title="Opportunities" empty="No opportunities have been added." rows={opportunities.data?.map((item) => ({ title: item.title, meta: [item.customers?.[0]?.name, item.expected_value ? `${item.currency_code} ${item.expected_value}` : null].filter(Boolean).join(" · "), status: item.stage })) ?? []} /></div></>}</main>;
}

function CrmList({ title, empty, rows }: { title: string; empty: string; rows: Array<{ title: string; meta: string; status: string }> }) { return <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--betanor-border)] px-5 py-4"><h2 className="font-semibold text-[var(--betanor-navy)]">{title}</h2><span className="text-sm text-[var(--betanor-muted)]">{rows.length}</span></div>{rows.length ? <ul className="divide-y divide-[var(--betanor-border)]">{rows.map((row) => <li key={`${row.title}-${row.meta}`} className="px-5 py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{row.title}</p><p className="mt-1 truncate text-xs text-[var(--betanor-muted)]">{row.meta || "No additional detail"}</p></div><Badge tone={row.status === "active" || row.status === "approved" ? "success" : "draft"}>{row.status}</Badge></div></li>)}</ul> : <p className="px-5 py-8 text-sm text-[var(--betanor-muted)]">{empty}</p>}</Card>; }
