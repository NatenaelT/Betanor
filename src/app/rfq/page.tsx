import { redirect } from "next/navigation";

import { PublicHeader } from "@/components/navigation/public-header";
import { SiteFooter } from "@/components/navigation/site-footer";
import { PageHero } from "@/components/public/page-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";

async function submitRfq(data: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("submit_public_rfq", {
    requester_name_input: String(data.get("name") ?? "").trim(), requester_email_input: String(data.get("email") ?? "").trim(), requester_phone_input: String(data.get("phone") ?? "").trim(), organization_input: String(data.get("organization") ?? "").trim(), request_type_input: String(data.get("requestType") ?? "").trim(), requirements_input: String(data.get("requirements") ?? "").trim(), timeline_input: String(data.get("timeline") ?? "").trim(), items_input: [],
  });
  if (error || !result?.[0]?.reference) redirect(`/rfq?error=${encodeURIComponent("We could not submit the RFQ. Please review the required details and try again.")}`);
  redirect(`/rfq?reference=${encodeURIComponent(result[0].reference)}`);
}

export default async function RfqPage({ searchParams }: { searchParams: Promise<{ reference?: string; error?: string }> }) {
  const query = await searchParams;
  return <><PublicHeader /><main><PageHero eyebrow="Request for quotation" title="Tell us what you need, and we will shape the right response.">Share your technology, product, implementation, or support requirement. Betanor will review it and respond with the appropriate next step.</PageHero><section className="mx-auto max-w-3xl px-6 py-14 lg:px-8">{query.reference ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-7 text-emerald-950"><h2 className="text-xl font-semibold">Your RFQ has been received.</h2><p className="mt-2 leading-7">Reference: <strong>{query.reference}</strong>. Our team will review your request and contact you using the details provided.</p></div> : <form action={submitRfq} className="grid gap-5 rounded-2xl border border-[var(--betanor-border)] bg-white p-6 shadow-[var(--betanor-shadow-card)] sm:grid-cols-2 sm:p-8"><label className="text-sm font-semibold text-[var(--betanor-navy)]">Your name<Input name="name" required className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Work email<Input name="email" type="email" required className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Organization<Input name="organization" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Phone<Input name="phone" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)] sm:col-span-2">Request type<select name="requestType" className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option>Technology solution</option><option>Product supply</option><option>Implementation</option><option>Managed support</option><option>Training</option></select></label><label className="text-sm font-semibold text-[var(--betanor-navy)] sm:col-span-2">Requirements<textarea name="requirements" required minLength={10} rows={6} className="mt-2 w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="Describe the technology, quantities, scope, location, or desired outcome." /></label><label className="text-sm font-semibold text-[var(--betanor-navy)] sm:col-span-2">Preferred timeline<Input name="timeline" className="mt-2" placeholder="For example: Q4 2026 or within 30 days" /></label>{query.error ? <p className="sm:col-span-2 text-sm text-[var(--betanor-danger)]">{query.error}</p> : null}<div className="sm:col-span-2"><Button type="submit" size="lg">Submit RFQ</Button></div></form>}</section></main><SiteFooter /></>;
}
