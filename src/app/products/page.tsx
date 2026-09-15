import { ContentCard, ContentGrid } from "@/components/public/content-grid";
import { PageHero } from "@/components/public/page-hero";
import { PublicHeader } from "@/components/navigation/public-header";
import { SiteFooter } from "@/components/navigation/site-footer";
const items = ["Computing", "Servers & infrastructure", "Computer components", "Accessories & peripherals", "Printing & office technology", "Security & access control", "Digital display solutions", "Professional video & media equipment"];
export default function ProductsPage() { return <><PublicHeader /><main><PageHero eyebrow="Products" title="Professional technology products, selected for the work ahead.">Our catalogue supports business-to-business quotation requests for organizations evaluating products, quantities, installation, and ongoing support.</PageHero><ContentGrid>{items.map((title) => <ContentCard key={title} title={title}>Talk to Betanor for suitable products, solution design, installation, configuration, warranty, and after-sales support.</ContentCard>)}</ContentGrid></main><SiteFooter /></>; }
