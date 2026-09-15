import { ContentCard, ContentGrid } from "@/components/public/content-grid";
import { PageHero } from "@/components/public/page-hero";
import { PublicHeader } from "@/components/navigation/public-header";
import { SiteFooter } from "@/components/navigation/site-footer";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data: products } = await supabase.from("products").select("id, name, slug, brand, model, short_description, availability, warranty, product_categories(name)").order("name");
  return <><PublicHeader /><main><PageHero eyebrow="Products" title="Professional technology products, selected for the work ahead.">Our catalogue supports business-to-business quotation requests for organizations evaluating products, quantities, installation, and ongoing support.</PageHero>{products?.length ? <ContentGrid>{products.map((product) => <ContentCard key={product.id} title={product.name}>{[product.brand, product.model, product.product_categories?.[0]?.name, product.short_description, product.availability, product.warranty].filter(Boolean).join(" · ")}</ContentCard>)}</ContentGrid> : <section className="mx-auto max-w-7xl px-6 py-14 lg:px-8"><div className="rounded-2xl border border-[var(--betanor-border)] bg-[var(--betanor-surface)] p-8"><h2 className="text-2xl font-semibold text-[var(--betanor-navy)]">Tell us what you need.</h2><p className="mt-3 max-w-2xl leading-7 text-[var(--betanor-muted)]">Our team can source and configure the right technology products for your requirements, quantities, installation, and support plan.</p><a className="mt-5 inline-flex text-sm font-semibold text-[var(--betanor-blue)]" href="mailto:info@betanor.et?subject=Product%20enquiry">Discuss a product requirement →</a></div></section>}</main><SiteFooter /></>;
}
