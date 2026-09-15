import { ContentCard, ContentGrid } from "@/components/public/content-grid";
import { PageHero } from "@/components/public/page-hero";
import { PublicHeader } from "@/components/navigation/public-header";
const industries = ["Hospitals & healthcare", "Government organizations", "Non-governmental organizations", "Private companies", "Enterprise institutions", "Education & training"];
export default function IndustriesPage() { return <><PublicHeader /><main><PageHero eyebrow="Industries" title="Technology that respects the realities of your sector.">Every environment has different operational constraints. We adapt planning, implementation, security, and support to the organizations we serve.</PageHero><ContentGrid>{industries.map((industry) => <ContentCard key={industry} title={industry}>Technology planning and delivery designed around continuity, compliance, users, and practical operations.</ContentCard>)}</ContentGrid></main></>; }
