import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ContentKind = "industry" | "service" | "case-study" | "insight";
const kinds: ContentKind[] = ["industry", "service", "case-study", "insight"];

function isContentKind(value: FormDataEntryValue | null): value is ContentKind {
  return typeof value === "string" && kinds.includes(value as ContentKind);
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function createContent(formData: FormData) {
  "use server";
  const kind = formData.get("kind");
  const title = text(formData, "title");
  const slug = text(formData, "slug").toLowerCase();
  const summary = text(formData, "summary");
  const content = text(formData, "content");
  if (!isContentKind(kind) || !title || !slug) return;

  const supabase = await createClient();
  if (kind === "industry") await supabase.from("industries").insert({ name: title, slug, description: summary, status: "draft" });
  if (kind === "service") await supabase.from("services").insert({ title, slug, excerpt: summary, content, status: "draft" });
  if (kind === "case-study") await supabase.from("case_studies").insert({ title, slug, summary, content, status: "draft" });
  if (kind === "insight") await supabase.from("insights").insert({ title, slug, excerpt: summary, content, status: "draft" });
  revalidatePath("/workspace/cms");
}

async function publishContent(kind: ContentKind, id: string) {
  "use server";
  const supabase = await createClient();
  const values = { status: "active", published_at: new Date().toISOString() };
  if (kind === "industry") await supabase.from("industries").update(values).eq("id", id);
  if (kind === "service") await supabase.from("services").update(values).eq("id", id);
  if (kind === "case-study") await supabase.from("case_studies").update(values).eq("id", id);
  if (kind === "insight") await supabase.from("insights").update(values).eq("id", id);
  revalidatePath("/workspace/cms");
}

async function archiveContent(kind: ContentKind, id: string) {
  "use server";
  const supabase = await createClient();
  const values = { status: "archived", published_at: null };
  if (kind === "industry") await supabase.from("industries").update(values).eq("id", id);
  if (kind === "service") await supabase.from("services").update(values).eq("id", id);
  if (kind === "case-study") await supabase.from("case_studies").update(values).eq("id", id);
  if (kind === "insight") await supabase.from("insights").update(values).eq("id", id);
  revalidatePath("/workspace/cms");
  revalidatePath("/services");
  revalidatePath("/industries");
  revalidatePath("/insights");
}

export default async function CmsPage() {
  const supabase = await createClient();
  const [industries, services, caseStudies, insights] = await Promise.all([
    supabase.from("industries").select("id, name, slug, status, published_at").order("updated_at", { ascending: false }),
    supabase.from("services").select("id, title, slug, status, published_at").order("updated_at", { ascending: false }),
    supabase.from("case_studies").select("id, title, slug, status, published_at").order("updated_at", { ascending: false }),
    supabase.from("insights").select("id, title, slug, status, published_at").order("updated_at", { ascending: false }),
  ]);

  const collections = [
    { kind: "industry" as const, label: "Industries", rows: industries.data?.map((row) => ({ ...row, title: row.name })) ?? [] },
    { kind: "service" as const, label: "Services", rows: services.data ?? [] },
    { kind: "case-study" as const, label: "Case studies", rows: caseStudies.data ?? [] },
    { kind: "insight" as const, label: "Insights", rows: insights.data ?? [] },
  ];
  const canRead = !industries.error && !services.error && !caseStudies.error && !insights.error;

  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Content management</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Publish with confidence.</h1><p className="mt-3 max-w-2xl text-base leading-7 text-[var(--betanor-muted)]">Create and govern the content used across the Betanor public experience.</p></div><Badge tone="info">RLS protected</Badge></div>
    {!canRead ? <Card className="mt-8 p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">CMS access is required</h2><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">Ask an administrator to assign the CMS reader, writer, or publisher capability to your account.</p></Card> : <>
      <Card className="mt-8 p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Create draft</h2><form action={createContent} className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold text-[var(--betanor-navy)]">Content type<select name="kind" className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="service">Service</option><option value="industry">Industry</option><option value="case-study">Case study</option><option value="insight">Insight</option></select></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Title<Input name="title" required className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Slug<Input name="slug" required pattern="[a-z0-9-]+" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Short summary<Input name="summary" className="mt-2" /></label><label className="md:col-span-2 text-sm font-semibold text-[var(--betanor-navy)]">Content<textarea name="content" rows={5} className="mt-2 w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm outline-none focus:border-[var(--betanor-electric-blue)] focus:ring-2 focus:ring-blue-100" /></label><div className="md:col-span-2"><Button type="submit">Save draft</Button></div></form></Card>
      <div className="mt-8 grid gap-5 xl:grid-cols-2">{collections.map((collection) => <Card key={collection.kind} className="overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--betanor-border)] px-5 py-4"><h2 className="font-semibold text-[var(--betanor-navy)]">{collection.label}</h2><span className="text-sm text-[var(--betanor-muted)]">{collection.rows.length}</span></div>{collection.rows.length ? <ul className="divide-y divide-[var(--betanor-border)]">{collection.rows.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{row.title}</p><p className="mt-1 truncate text-xs text-[var(--betanor-muted)]">/{row.slug}</p></div><div className="flex shrink-0 items-center gap-2"><Badge tone={row.status === "active" ? "success" : "draft"}>{row.status}</Badge>{row.status !== "active" ? <form action={publishContent.bind(null, collection.kind, row.id)}><Button type="submit" size="sm">Publish</Button></form> : null}{row.status !== "archived" ? <form action={archiveContent.bind(null, collection.kind, row.id)}><Button type="submit" size="sm" variant="outline">Archive</Button></form> : null}</div></li>)}</ul> : <p className="px-5 py-8 text-sm text-[var(--betanor-muted)]">No {collection.label.toLowerCase()} have been created.</p>}</Card>)}</div>
    </>}
  </main>;
}
