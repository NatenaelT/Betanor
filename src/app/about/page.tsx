import { ContentCard, ContentGrid } from "@/components/public/content-grid";
import { PageHero } from "@/components/public/page-hero";
import { PublicHeader } from "@/components/navigation/public-header";
import { SiteFooter } from "@/components/navigation/site-footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCachedPublicContent } from "@/lib/public-cache";

const missionText =
  "To help organizations build reliable and sustainable technology environments by providing expert IT consultancy, software solutions, infrastructure, technology products, implementation, training, and responsive technical support.";

const visionText =
  "To become one of Ethiopia’s most trusted technology solution providers, recognized for delivering innovative, reliable, secure, and sustainable digital and IT infrastructure solutions.";

const values = [
  ["B", "Bold innovation", "We embrace practical technologies and ideas that create measurable value."],
  ["E", "Excellence", "We maintain high professional and technical standards in every engagement."],
  ["T", "Trust", "We work with integrity, transparency, and accountability."],
  ["A", "Agility", "We respond quickly and adapt solutions to the client environment."],
  ["N", "Need-driven", "We start with the actual client problem, not with a product we want to sell."],
  ["O", "Ownership", "We take responsibility from consultation through implementation and after-sales support."],
  ["R", "Reliability", "Clients can depend on our people, systems, products, and support."],
];

const deliverySteps = [
  ["01", "Consult", "Understand business, technical, and operational needs."],
  ["02", "Design", "Translate requirements into an appropriate solution architecture."],
  ["03", "Supply or develop", "Source technology or develop the required digital solution."],
  ["04", "Implement", "Install, configure, integrate, test, and deploy."],
  ["05", "Train", "Transfer knowledge to administrators and end users."],
  ["06", "Maintain", "Protect continuity through preventive and corrective maintenance."],
  ["07", "Support", "Provide responsive onsite or remote technical support."],
];

export default async function AboutPage() {
  const content = await getCachedPublicContent("about");
  const hero = content.get("hero");
  const mission = content.get("mission");
  const vision = content.get("vision");
  const missionCopy = mission?.title?.trim() || missionText;
  const visionCopy = vision?.title?.trim() || visionText;

  return (
    <>
      <PublicHeader />
      <main>
        <PageHero
          eyebrow={hero?.eyebrow || "About Betanor"}
          title={hero?.title || "One technology partner. From strategy to support."}
        >
          {hero?.body ||
            "Betanor General Trading P.L.C. is an Ethiopia-based technology solutions company serving organizations that need dependable digital systems, IT infrastructure, technology products, implementation support, maintenance, and technical capacity building."}
        </PageHero>

        <section className="mx-auto grid max-w-7xl gap-8 px-6 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="self-center">
            <Badge tone="draft">Always Welcome, Always Ready.</Badge>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">
              A technology partner built around client needs.
            </h2>
            <p className="mt-5 text-base leading-8 text-[var(--betanor-muted)]">
              Betanor combines consulting, technology supply, implementation, and long-term support in one coordinated service model. We begin with the client’s operational challenge, design the right solution, source or develop the required technology, implement it properly, transfer knowledge, and remain available for maintenance and support.
            </p>
            <p className="mt-4 text-base leading-8 text-[var(--betanor-muted)]">
              Our work brings software, infrastructure, managed IT, security, technology products, and technical services together when clients need a coherent solution rather than fragmented vendors.
            </p>
          </div>

          <div id="mission-vision" className="scroll-mt-24">
            <p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">
              Our purpose
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">
              Mission &amp; Vision
            </h2>
            <div className="mt-5 grid gap-4">
              <Card>
                <CardContent>
                  <h3 className="text-lg font-semibold text-[var(--betanor-navy)]">
                    {mission?.eyebrow || "Our mission"}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-[var(--betanor-text)]">
                    {missionCopy}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <h3 className="text-lg font-semibold text-[var(--betanor-navy)]">
                    {vision?.eyebrow || "Our vision"}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-[var(--betanor-text)]">
                    {visionCopy}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="bg-[var(--betanor-surface)] px-6 py-14 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">
              How we work
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">
              From strategy to support.
            </h2>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {deliverySteps.map(([number, title, description]) => (
                <Card key={number}>
                  <CardContent>
                    <p className="text-sm font-bold text-[var(--betanor-gold)]">{number}</p>
                    <h3 className="mt-3 font-semibold text-[var(--betanor-navy)]">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-7xl px-6 pt-14 lg:px-8">
            <p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">
              Our values
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">
              BETANOR in practice.
            </h2>
          </div>
          <ContentGrid>
            {values.map(([letter, title, description]) => (
              <ContentCard key={letter} title={`${letter} — ${title}`}>
                {description}
              </ContentCard>
            ))}
          </ContentGrid>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
