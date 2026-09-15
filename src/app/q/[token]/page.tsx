import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function acceptQuotation(data: FormData) {
  "use server";
  const token = String(data.get("token") ?? "");
  const acceptedBy = String(data.get("acceptedBy") ?? "").trim();
  const supabase = await createClient();
  const { data: accepted } = await supabase.rpc("accept_shared_quotation", { token_input: token, accepted_by_input: acceptedBy });
  redirect(`/q/${encodeURIComponent(token)}?accepted=${accepted ? "1" : "0"}`);
}

export default async function SharedQuotationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ accepted?: string }> }) {
  const { token } = await params; const query = await searchParams; const supabase = await createClient();
  const { data } = await supabase.rpc("get_shared_quotation", { token_input: token }); const quote = data?.[0];
  if (!quote) return <main className="grid min-h-screen place-items-center bg-[var(--betanor-surface)] p-6"><Card className="max-w-lg p-8"><h1 className="text-2xl font-semibold text-[var(--betanor-navy)]">This quotation link is unavailable.</h1><p className="mt-3 leading-7 text-[var(--betanor-muted)]">It may have expired, been replaced, or no longer be approved. Please contact Betanor for assistance.</p></Card></main>;
  return <main className="min-h-screen bg-[var(--betanor-surface)] px-6 py-12"><Card className="mx-auto max-w-3xl p-6 sm:p-10"><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Betanor quotation</p><h1 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">{quote.title}</h1><p className="mt-2 text-sm text-[var(--betanor-muted)]">{quote.quotation_number} · Currency: {quote.currency_code}</p><div className="mt-8 grid gap-3 rounded-xl bg-slate-50 p-5 text-sm"><p>Subtotal: <strong>{quote.currency_code} {quote.subtotal}</strong></p><p>VAT ({quote.vat_rate}%{quote.tax_inclusive ? ", inclusive" : ""}): <strong>{quote.currency_code} {quote.tax_amount}</strong></p><p className="text-lg font-semibold text-[var(--betanor-navy)]">Total: {quote.currency_code} {quote.total_amount}</p></div><div className="mt-7 grid gap-3 text-sm leading-6 text-[var(--betanor-text)]"><p><strong>Payment terms:</strong> {quote.payment_terms || "To be agreed in the executed agreement."}</p><p><strong>Delivery / implementation:</strong> {quote.delivery_terms || "To be agreed in the executed agreement."}</p><p><strong>Place of supply:</strong> {quote.place_of_supply || "Ethiopia"}</p><p className="text-xs text-[var(--betanor-muted)]">This electronic acceptance records your stated name and time of acceptance. It does not replace any mandatory fiscal invoice, tax documentation, or signature process required for the transaction.</p></div>{quote.accepted_at || query.accepted === "1" ? <p className="mt-8 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">Acceptance has been recorded. Betanor will contact you about the next contractual step.</p> : <form action={acceptQuotation} className="mt-8 border-t border-[var(--betanor-border)] pt-6"><input type="hidden" name="token" value={token} /><label className="text-sm font-semibold text-[var(--betanor-navy)]">Full name of authorized representative<input required name="acceptedBy" className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-border)] px-3 text-sm" /></label><Button type="submit" className="mt-4">Accept quotation</Button></form>}</Card></main>;
}
