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

const serviceDetails: Record<
  string,
  { description: string; example: string; principles: string; values: string }
> = {
  "software-digital-solutions-consulting": {
    description:
      "We help clarify the business problem before selecting technology. The work can cover requirements and process analysis, software and system architecture, platform selection, user experience, database and data modelling, APIs and interoperability, security review, and clear technical specifications or documentation.",
    example:
      "A hospital planning a patient-registration system could begin with process mapping, user roles, data needs, integration points, and security requirements—then receive a documented architecture and implementation roadmap before committing to development.",
    principles:
      "Need-Driven means recommendations start with the organization’s actual workflows. Trust means options, assumptions, risks, and trade-offs are explained clearly.",
    values: "Need-Driven · Trust · Excellence",
  },
  "software-development-implementation": {
    description:
      "We design, build, integrate, test, and deploy custom web applications, enterprise systems, dashboards, databases, APIs, and workflow tools. Delivery can include data migration, user acceptance testing, documentation, training, and post-implementation support so the solution works in the client’s environment.",
    example:
      "A growing company could replace email-based purchase approvals with a responsive request workflow that routes decisions to the right managers and gives finance a clear audit trail and reporting view.",
    principles:
      "Bold Innovation is practical: use technology to remove a real bottleneck, not to chase novelty. Ownership means staying accountable through testing, deployment, and early support.",
    values: "Bold Innovation · Ownership · Reliability",
  },
  "it-infrastructure-data-center": {
    description:
      "We plan and support dependable IT foundations: LAN, WAN, Wi-Fi and SD-WAN; servers, storage and virtualization; switching, routing and firewalls; data-centre layout, racks and structured cabling; UPS, backups and disaster recovery; security hardening; and implementation documentation.",
    example:
      "For an organization moving into a larger office, the engagement might include a network and Wi-Fi plan, segmented access, a server and storage design, backup and recovery procedures, and a documented installation plan.",
    principles:
      "Excellence is reflected in tested designs and complete documentation. Reliability means planning for continuity, recovery, maintainability, and the people who will operate the environment.",
    values: "Excellence · Reliability · Ownership",
  },
  "managed-it-support": {
    description:
      "We provide agreed onsite and remote support for users, endpoints, servers, and networks. Depending on the engagement, this includes administration, system-health and backup checks, incident diagnosis and escalation, preventive maintenance, scheduled visits, and service reporting under a support contract.",
    example:
      "Under a scheduled support arrangement, a technician could visit on Thursday morning to resolve workstation issues, check network and backup health, update the asset register, and record follow-up actions; urgent issues between visits can be triaged remotely.",
    principles:
      "Agility means responding through the channel that fits the issue. Reliability and Trust mean recording work, communicating status, and setting clear expectations rather than leaving users unsure.",
    values: "Agility · Trust · Reliability",
  },
  "maintenance-technical-services": {
    description:
      "We maintain desktops, laptops, printers, servers, network equipment, and related hardware through preventive checks and corrective work. Service can include fault diagnosis, cleaning, component replacement or upgrades, emergency support, maintenance agreements, and a clear record of work and recommendations.",
    example:
      "A scheduled workstation review could check device health, storage, cooling, operating-system and hardware updates, and printer/network connectivity—then document faults and obtain approval before replacing parts.",
    principles:
      "Ownership means following an issue through to a documented outcome. Reliability means prioritizing safe, maintainable repairs and preventive care over short-lived fixes.",
    values: "Ownership · Reliability · Excellence",
  },
  "training-capacity-building": {
    description:
      "We develop practical learning for administrators, end users, and technical teams. This may include custom software training, digital-tools sessions, infrastructure workshops, user manuals, technical guides, and follow-up support shaped around the client’s systems and staff responsibilities.",
    example:
      "After a system rollout, administrators could receive configuration and troubleshooting training while end users practice their everyday tasks with short role-based guides they can refer to later.",
    principles:
      "Excellence means teaching people to use the solution well. Ownership means transferring knowledge so the client can operate and improve its environment instead of depending on a black box.",
    values: "Excellence · Ownership · Need-Driven",
  },
  "security-surveillance": {
    description:
      "We assess, design, install, configure, and maintain CCTV and surveillance systems, including IP, analogue, and PTZ cameras; NVR/DVR and storage; access control; biometric and attendance systems; and electronic locks. Scope is based on site coverage, operating needs, access rules, and maintainability.",
    example:
      "For a school campus, an assessment could map entry points and shared areas, propose camera coverage and recording storage, define authorized access to footage, and include installation checks and handover documentation.",
    principles:
      "Need-Driven design avoids installing equipment without a clear operational purpose. Trust and Excellence call for transparent scope, careful configuration, and responsible handling of access and recorded information.",
    values: "Need-Driven · Trust · Excellence",
  },
};

function detailedDescription(content: string | null, fallback: string) {
  const value = content?.trim();
  return value && value.length >= 180 ? value : fallback;
}

export default async function ServicesPage() {
  const [{ services, products, industries, caseStudies }, content] = await Promise.all([
    getCachedServicesCatalogue(),
    getCachedPublicContent("services"),
  ]);
  const hero = content.get("hero");
  const capabilities = content.get("capabilities");
  const productsSection = content.get("products");

  return (
    <>
      <PublicHeader />
      <main>
        <PageHero
          eyebrow={hero?.eyebrow || "Services & catalogue"}
          title={hero?.title || "One connected technology partner for the work ahead."}
        >
          {hero?.body ||
            "Consulting, solutions, industries, products, and delivery support now live in one clear catalogue. Start with the capability you need, then request a tailored Ethiopian-market quotation."}
        </PageHero>

        <section className="mx-auto max-w-7xl px-6 pt-14 lg:px-8">
          <p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">
            {capabilities?.eyebrow || "Capabilities"}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">
            {capabilities?.title || "Services shaped around the client’s real needs."}
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--betanor-muted)]">
            We combine practical technology with clear advice, professional delivery, knowledge transfer, and ongoing support. The examples below illustrate how a service might be applied; each engagement is scoped to the client’s requirements.
          </p>
        </section>

        <section aria-label="Betanor services" className="mx-auto grid max-w-7xl gap-5 px-6 py-8 sm:grid-cols-2 lg:px-8">
          {services?.length ? (
            services.map((service) => {
              const detail = serviceDetails[service.slug];
              return (
                <Card key={service.id} className="h-full">
                  <CardContent className="flex h-full flex-col p-6">
                    <h3 className="text-xl font-semibold text-[var(--betanor-navy)]">{service.title}</h3>
                    {service.excerpt ? (
                      <p className="mt-3 text-base leading-7 text-[var(--betanor-muted)]">{service.excerpt}</p>
                    ) : null}
                    {detail ? (
                      <div className="mt-5 space-y-5">
                        <div>
                          <h4 className="text-sm font-semibold text-[var(--betanor-navy)]">What the service covers</h4>
                          <p className="mt-2 text-base leading-7 text-[var(--betanor-text)]">
                            {detailedDescription(service.content, detail.description)}
                          </p>
                        </div>
                        <div className="border-l-2 border-[var(--betanor-gold)] pl-4">
                          <h4 className="text-sm font-semibold text-[var(--betanor-navy)]">Example in practice</h4>
                          <p className="mt-2 text-base leading-7 text-[var(--betanor-muted)]">{detail.example}</p>
                        </div>
                        <div className="rounded-lg bg-[var(--betanor-surface)] p-4">
                          <p className="text-xs font-semibold tracking-[0.08em] text-[var(--betanor-blue)] uppercase">
                            {detail.values}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-[var(--betanor-text)]">{detail.principles}</p>
                        </div>
                      </div>
                    ) : service.content ? (
                      <p className="mt-4 text-base leading-7 text-[var(--betanor-text)]">{service.content}</p>
                    ) : null}
                    <Link
                      className="mt-6 inline-flex min-h-11 items-center self-start rounded-lg bg-[var(--betanor-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--betanor-blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--betanor-blue)]"
                      href={`/rfq?context=${encodeURIComponent(service.title)}`}
                    >
                      Request a quotation
                    </Link>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card className="p-6 sm:col-span-2">
              <CardContent>
                Betanor’s consulting, implementation, infrastructure, support, security, and training teams can scope a solution for your organization.
              </CardContent>
            </Card>
          )}
        </section>

        <section className="bg-[var(--betanor-surface)] px-6 py-14 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">
              Solutions &amp; industries
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">
              Context-aware delivery for Ethiopian organizations.
            </h2>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(industries?.length
                ? industries.map((industry) => [industry.name, industry.description])
                : solutionLines
              ).map(([title, description]) => (
                <Card key={title}>
                  <CardContent>
                    <h3 className="font-semibold text-[var(--betanor-navy)]">{title}</h3>
                    <p className="mt-2 text-base leading-7 text-[var(--betanor-muted)]">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="products" className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
          <p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">
            {productsSection?.eyebrow || "Technology products"}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">
            {productsSection?.title || "Selected products with implementation behind them."}
          </h2>
          {products?.length ? (
            <ContentGrid>
              {products.map((product) => (
                <ContentCard key={product.id} title={product.name}>
                  {product.main_image_path ? (
                    <img
                      src={publicSiteAssetUrl(product.main_image_path) ?? undefined}
                      alt=""
                      className="mb-4 h-36 w-full rounded-xl object-cover"
                    />
                  ) : null}
                  <p>
                    {[
                      product.brand,
                      product.model,
                      product.product_categories?.[0]?.name,
                      product.short_description,
                      product.availability,
                      product.warranty,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <Link
                    className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[var(--betanor-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--betanor-blue)]"
                    href={`/rfq?context=${encodeURIComponent(product.name)}`}
                  >
                    Request a quotation
                  </Link>
                </ContentCard>
              ))}
            </ContentGrid>
          ) : (
            <Card className="mt-7 p-6">
              <CardContent>
                Our catalogue team will source, configure, and support the products that match your specification, quantity, and budget.
              </CardContent>
            </Card>
          )}
          {caseStudies?.length ? (
            <div className="mt-10">
              <p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">
                Company outcomes
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {caseStudies.map((item) => (
                  <Card key={item.id}>
                    <CardContent>
                      <h3 className="font-semibold text-[var(--betanor-navy)]">{item.title}</h3>
                      <p className="mt-2 text-base leading-7 text-[var(--betanor-muted)]">{item.summary}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
