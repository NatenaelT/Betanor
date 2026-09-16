import Link from "next/link";
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
  const context = String(data.get("context") ?? "").trim();
  const { data: result } = await supabase.rpc("submit_customer_rfq", {
    requester_name_input: String(data.get("name") ?? "").trim(),
    requester_phone_input: String(data.get("phone") ?? "").trim(),
    request_type_input: String(data.get("requestType") ?? "").trim(),
    requirements_input: String(data.get("requirements") ?? "").trim(),
    timeline_input: String(data.get("timeline") ?? "").trim(),
    items_input: JSON.stringify(context ? [{ description: context }] : []),
  });
  if (result?.[0]?.reference) redirect(`/rfq?reference=${encodeURIComponent(result[0].reference)}`);
}

export default async function RfqPage({ searchParams }: { searchParams: Promise<{ reference?: string; context?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  const { data: access } = userId ? await supabase.from("customer_portal_access").select("customer_id,customers(name,phone)").eq("profile_id", userId).eq("is_active", true).limit(1).maybeSingle() : { data: null };
  const customer = Array.isArray(access?.customers) ? access.customers[0] : access?.customers;
  return <><PublicHeader /><main><PageHero eyebrow="Request for quotation" title="Tell us what you need, and we will shape the right response.">Your request goes directly into the Betanor commercial workflow. Sign in with your customer email so every quotation and follow-up stays connected to your organization.</PageHero><section className="mx-auto max-w-3xl px-6 py-14 lg:px-8">{query.reference ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-7 text-emerald-950"><h2 className="text-xl font-semibold">Your RFQ has been received.</h2><p className="mt-2 leading-7">Reference: <strong>{query.reference}</strong>. You can follow progress from your customer portal.</p><Link href="/portal" className="mt-5 inline-flex rounded-lg bg-[var(--betanor-navy)] px-4 py-2.5 text-sm font-semibold text-white">Open customer portal</Link></div> : !userId ? <div className="rounded-2xl border border-[var(--betanor-border)] bg-white p-8 text-center shadow-[var(--betanor-shadow-card)]"><h2 className="text-2xl font-semibold text-[var(--betanor-navy)]">Customer sign-in required</h2><p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">Request-for-quotation records are private to authenticated customer accounts.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link href="/login?next=/rfq" className="rounded-lg bg-[var(--betanor-navy)] px-4 py-2.5 text-sm font-semibold text-white">Sign in</Link><Link href="/customer/register?next=/rfq" className="rounded-lg border border-[var(--betanor-border)] px-4 py-2.5 text-sm font-semibold text-[var(--betanor-navy)]">Create account</Link></div></div> : !access?.customer_id ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8"><h2 className="text-xl font-semibold text-amber-950">Finish your customer profile first</h2><p className="mt-3 text-sm leading-6 text-amber-900">We need to associate this RFQ with an organization before submitting it.</p><Link href="/customer/onboard" className="mt-5 inline-flex rounded-lg bg-[var(--betanor-navy)] px-4 py-2.5 text-sm font-semibold text-white">Complete profile</Link></div> : <form action={submitRfq} className="grid gap-5 rounded-2xl border border-[var(--betanor-border)] bg-white p-6 shadow-[var(--betanor-shadow-card)] sm:grid-cols-2 sm:p-8"><div className="sm:col-span-2 rounded-xl bg-blue-50 p-4 text-sm text-blue-950"><strong>{customer?.name || "Your organization"}</strong><span className="ml-2 text-blue-800">· private customer RFQ</span></div><label className="text-sm font-semibold text-[var(--betanor-navy)]">Your name<Input name="name" required defaultValue={customer?.name || ""} className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Mobile number<Input name="phone" type="tel" defaultValue={customer?.phone || ""} className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)] sm:col-span-2">Service or product context<Input name="context" defaultValue={query.context || ""} placeholder="e.g. network security assessment or laptops" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)] sm:col-span-2">Request type<select name="requestType" className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option>Technology solution</option><option>Product supply</option><option>Implementation</option><option>Managed support</option><option>Training</option></select></label><label className="text-sm font-semibold text-[var(--betanor-navy)] sm:col-span-2">Requirements<textarea name="requirements" required minLength={10} rows={6} className="mt-2 w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="Describe the technology, quantities, scope, location, or desired outcome." /></label><label className="text-sm font-semibold text-[var(--betanor-navy)] sm:col-span-2">Preferred timeline<Input name="timeline" placeholder="For example: within 30 days" className="mt-2" /></label><div className="sm:col-span-2"><Button type="submit" size="lg">Submit private RFQ</Button></div></form>}</section></main><SiteFooter /></>;
}
