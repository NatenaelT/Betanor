import { redirect } from "next/navigation";

import { TenderManagementPanel } from "@/components/tenders/tender-management-panel";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";
export default async function TendersPage() { const supabase = await createClient(); const access = await resolveWorkspace(supabase); if (!access.workspaceId || (!access.permissions.has("tender.read") && !access.permissions.has("tender.view_all"))) redirect("/workspace"); const { data: tenders } = await supabase.from("tenders").select("id,reference_number,title,procuring_organization,status,submission_deadline,estimated_value,currency_code").eq("workspace_id", access.workspaceId).order("submission_deadline", { ascending: true, nullsFirst: false }).limit(100); const canCreate = access.permissions.has("tender.create"); return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Sales & delivery · Tenders</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Tender management</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--betanor-muted)]">Coordinate go/no-go decisions, technical and financial proposal work, CPO and bank guarantees, submission letters, and immutable final submissions.</p></div><Badge tone="info">Role-aware tender desk</Badge></div><TenderManagementPanel tenders={(tenders ?? []) as never[]} canCreate={canCreate} /></main>; }
