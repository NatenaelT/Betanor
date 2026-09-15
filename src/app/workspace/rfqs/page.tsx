import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RfqsPage() {
  const supabase = await createClient();
  const { data: rfqs, error } = await supabase.from("rfq_requests").select("id, reference, requester_name, requester_email, organization, request_type, timeline, status, created_at").order("created_at", { ascending: false }).limit(50);
  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8"><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">RFQs</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Incoming commercial requirements.</h1><p className="mt-3 max-w-2xl leading-7 text-[var(--betanor-muted)]">Review public and internal requests before qualifying them into a lead, quotation, or project.</p>{error ? <Card className="mt-8 p-6"><p className="text-sm text-[var(--betanor-muted)]">RFQ access is required.</p></Card> : <Card className="mt-8 overflow-hidden"><div className="grid grid-cols-[1.2fr_1fr_auto] gap-4 border-b border-[var(--betanor-border)] px-5 py-4 text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase"><span>Request</span><span>Requester</span><span>Status</span></div>{rfqs?.length ? rfqs.map((rfq) => <div key={rfq.id} className="grid grid-cols-[1.2fr_1fr_auto] gap-4 border-b border-[var(--betanor-border)] px-5 py-4 last:border-0"><div><p className="text-sm font-semibold text-[var(--betanor-navy)]">{rfq.reference}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">{rfq.request_type || "General requirement"} · {rfq.timeline || "No timeline"}</p></div><div className="min-w-0"><p className="truncate text-sm text-[var(--betanor-text)]">{rfq.requester_name}</p><p className="truncate text-xs text-[var(--betanor-muted)]">{rfq.organization || rfq.requester_email}</p></div><Badge tone={rfq.status === "approved" ? "success" : "draft"}>{rfq.status}</Badge></div>) : <p className="px-5 py-10 text-sm text-[var(--betanor-muted)]">No RFQs have been received.</p>}</Card>}</main>;
}
