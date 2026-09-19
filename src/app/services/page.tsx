import Link from "next/link";

import { ContentCard, ContentGrid } from "@/components/public/content-grid";
import { PageHero } from "@/components/public/page-hero";
import { PublicHeader } from "@/components/navigation/public-header";
import { SiteFooter } from "@/components/navigation/site-footer";
import { Card, CardContent } from "@/components/ui/card";
import { getCachedPublicContent, getCachedServicesCatalogue } from "@/lib/public-cache";
import { publicSiteAssetUrl } from "@/lib/site-content";

const solutionLines = [
  ["Digital workplace", "Secure, connected systems that help teams work clearly and efficiently."],
  ["Infrastructure & data centre", "Resilient networks, servers, backup, connectivity, and technical environments."],
  ["Security & continuity", "Surveillance, access, cyber hygiene, and practical continuity planning."],
  ["Business applications", "Software implementation, integration, automation, and data-led operations."],
];

export default async function ServicesPage() {
  const [{ services, products, industries, caseStudies }, content] = await Promise.all([
    getCachedServicesCatalogue(),
    getCachedPublicContent("services"),
  ]);
  const hero = content.get("hero");
  const capabilities = content.get("capabilities");
  const productsSection = content.get("products");
  return <><PublicHeader /><main><PageHero eyebrow={hero?.eyebrow || "Services & catalogue"} title={hero?.title || "One connected technology partner for the work ahead."}>{hero?.body || "Consulting, solutions, industries, products, and delivery support now live in one clear catalogue. Start with the capability you need, then request a tailored Ethiopian-market quotation."}</PageHero><section className="mx-auto max-w-7xl px-6 py-14 lg:px-8"><div className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">{capabilities?.eyebrow || "Capabilities"}</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">{capabilities?.title || "Services that move from advice to dependable operations."}</h2></div></div>{services?.length ? <ContentGrid>{services.map((service) => <ContentCard key={service.id} title={service.title}><p>{service.excerpt || service.content}</p><Link className="mt-5 inline-flex rounded-lg bg-[var(--betanor-navy)] px-3 py-2 text-xs font-semibold text-white" href={`/rfq?context=${encodeURIComponent(service.title)}`}>Request a quotation</Link></ContentCard>)}</ContentGrid> : <Card className="mt-7 p-6"><CardContent>Betanor’s consulting, implementation, infrastructure, support, security, and training teams can scope a solution for your organization.</CardContent></Card>}</section><section className="bg-[var(--betanor-surface)] px-6 py-14 lg:px-8"><div className="mx-auto max-w-7xl"><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Solutions & industries</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Context-aware delivery for Ethiopian organizations.</h2><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{(industries?.length ? industries.map((industry) => [industry.name, industry.description]) : solutionLines).map(([title, description]) => <Card key={title}><CardContent><h3 className="font-semibold text-[var(--betanor-navy)]">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">{description}</p></CardContent></Card>)}</div></div></section><section id="products" className="mx-auto max-w-7xl px-6 py-14 lg:px-8"><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">{productsSection?.eyebrow || "Technology products"}</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">{productsSection?.title || "Selected products with implementation behind them."}</h2>{products?.length ? <ContentGrid>{products.map((product) => <ContentCard key={product.id} title={product.name}>{product.main_image_path ? <img src={publicSiteAssetUrl(product.main_image_path) ?? undefined} alt="" className="mb-4 h-36 w-full rounded-xl object-cover" /> : null}<p>{[product.brand, product.model, product.product_categories?.[0]?.name, product.short_description, product.availability, product.warranty].filter(Boolean).join(" · ")}</p><Link className="mt-5 inline-flex rounded-lg bg-[var(--betanor-navy)] px-3 py-2 text-xs font-semibold text-white" href={`/rfq?context=${encodeURIComponent(product.name)}`}>Request a quotation</Link></ContentCard>)}</ContentGrid> : <Card className="mt-7 p-6"><CardContent>Our catalogue team will source, configure, and support the products that match your specification, quantity, and budget.</CardContent></Card>}{caseStudies?.length ? <div className="mt-10"><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Company outcomes</p><div className="mt-4 grid gap-4 md:grid-cols-2">{caseStudies.map((item) => <Card key={item.id}><CardContent><h3 className="font-semibold text-[var(--betanor-navy)]">{item.title}</h3><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">{item.summary}</p></CardContent></Card>)}</div></div> : null}</section></main><SiteFooter /></>;
}
