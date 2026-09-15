import { ContentCard, ContentGrid } from "@/components/public/content-grid";
import { PageHero } from "@/components/public/page-hero";
import { PublicHeader } from "@/components/navigation/public-header";
import { SiteFooter } from "@/components/navigation/site-footer";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const supabase = await createClient();
  const { data: services } = await supabase.from("services").select("id,title,excerpt,content").eq("status", "active").not("published_at", "is", null).order("title");
  return <><PublicHeader /><main><PageHero eyebrow="Services" title="Technology expertise from planning to long-term support.">Choose focused consulting or bring Betanor in across the full lifecycle of your technology initiative.</PageHero>{services?.length ? <ContentGrid>{services.map((service) => <ContentCard key={service.id} title={service.title}>{service.excerpt || service.content || "Betanor technology expertise, delivered with care."}</ContentCard>)}</ContentGrid> : <section className="mx-auto max-w-7xl px-6 py-14 lg:px-8"><div className="rounded-2xl border border-[var(--betanor-border)] bg-[var(--betanor-surface)] p-8"><h2 className="text-2xl font-semibold text-[var(--betanor-navy)]">Talk to Betanor about your technology needs.</h2><p className="mt-3 max-w-2xl leading-7 text-[var(--betanor-muted)]">Our team can scope consulting, software, infrastructure, support, training, and security work for your organization.</p><a className="mt-5 inline-flex text-sm font-semibold text-[var(--betanor-blue)]" href="/rfq">Start a request for quotation →</a></div></section>}</main><SiteFooter /></>;
}
