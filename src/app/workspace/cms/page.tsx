import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { publicSiteAssetUrl } from "@/lib/site-content";
import { resolveWorkspace } from "@/lib/workspace-context";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

type ContentKind = "industry" | "service" | "case-study" | "insight";
const kinds: ContentKind[] = ["industry", "service", "case-study", "insight"];

function isContentKind(value: FormDataEntryValue | null): value is ContentKind {
  return typeof value === "string" && kinds.includes(value as ContentKind);
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function cmsAccess(permission: "cms.write" | "cms.publish" = "cms.write") {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  return { supabase, access, allowed: Boolean(access.workspaceId && access.permissions.has(permission)) };
}

async function uploadSiteAsset(supabase: Awaited<ReturnType<typeof createClient>>, fileValue: FormDataEntryValue | null, workspaceId: string, folder: string) {
  if (!(fileValue instanceof File) || fileValue.size === 0) return null;
  if (fileValue.size > 50 * 1024 * 1024 || (!fileValue.type.startsWith("image/") && !fileValue.type.startsWith("video/"))) return null;
  const safeName = fileValue.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100) || "asset";
  const path = `${workspaceId}/${folder}/${randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("betanor-site-assets").upload(path, Buffer.from(await fileValue.arrayBuffer()), { contentType: fileValue.type, upsert: false });
  return error ? null : { path, type: fileValue.type.startsWith("video/") ? "video" : "image", mimeType: fileValue.type, size: fileValue.size };
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

async function updateContent(data: FormData) {
  "use server";
  const kind = data.get("kind");
  const id = text(data, "id");
  const title = text(data, "title");
  const slug = text(data, "slug").toLowerCase();
  if (!isContentKind(kind) || !id || !title || !slug) return;
  const supabase = await createClient();
  if (kind === "industry") await supabase.from("industries").update({ name: title, slug }).eq("id", id);
  if (kind === "service") await supabase.from("services").update({ title, slug }).eq("id", id);
  if (kind === "case-study") await supabase.from("case_studies").update({ title, slug }).eq("id", id);
  if (kind === "insight") await supabase.from("insights").update({ title, slug }).eq("id", id);
  revalidatePath("/workspace/cms");
  revalidatePath("/services");
  revalidatePath("/industries");
  revalidatePath("/insights");
}

async function deleteContent(kind: ContentKind, id: string) {
  "use server";
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.permissions.has("cms.write")) return;
  const table = kind === "industry" ? "industries" : kind === "service" ? "services" : kind === "case-study" ? "case_studies" : "insights";
  await supabase.from(table).delete().eq("id", id);
  revalidatePath("/workspace/cms");
}

async function createSiteContent(data: FormData) {
  "use server";
  const contentKey = text(data, "contentKey");
  const page = text(data, "page");
  const section = text(data, "section");
  const title = text(data, "title");
  if (!contentKey || !page || !section || !title) return;
  const { supabase, access, allowed } = await cmsAccess("cms.write");
  if (!allowed || !access.workspaceId || !access.userId) return;
  const image = await uploadSiteAsset(supabase, data.get("image"), access.workspaceId, "content");
  const video = await uploadSiteAsset(supabase, data.get("video"), access.workspaceId, "content");
  const { data: content, error } = await supabase.from("site_content").insert({ workspace_id: access.workspaceId, content_key: contentKey, page, section, eyebrow: text(data, "eyebrow") || null, title, body: text(data, "body") || null, cta_label: text(data, "ctaLabel") || null, cta_href: text(data, "ctaHref") || null, image_path: image?.type === "image" ? image.path : null, video_path: video?.type === "video" ? video.path : null, status: "draft", created_by: access.userId, updated_by: access.userId }).select("id").single();
  if (error || !content) return;
  const assets = [image, video].filter(Boolean).map((asset) => ({ workspace_id: access.workspaceId, content_id: content.id, storage_path: asset!.path, asset_type: asset!.type, mime_type: asset!.mimeType, size_bytes: asset!.size, created_by: access.userId }));
  if (assets.length) await supabase.from("site_content_assets").insert(assets);
  revalidatePath("/workspace/cms");
}

async function updateSiteContent(data: FormData) {
  "use server";
  const id = text(data, "id");
  const title = text(data, "title");
  if (!id || !title) return;
  const { supabase, access, allowed } = await cmsAccess("cms.write");
  if (!allowed || !access.workspaceId || !access.userId) return;
  const image = await uploadSiteAsset(supabase, data.get("image"), access.workspaceId, "content");
  const video = await uploadSiteAsset(supabase, data.get("video"), access.workspaceId, "content");
  const values: Record<string, unknown> = { eyebrow: text(data, "eyebrow") || null, title, body: text(data, "body") || null, cta_label: text(data, "ctaLabel") || null, cta_href: text(data, "ctaHref") || null, updated_by: access.userId };
  if (image?.type === "image") values.image_path = image.path;
  if (video?.type === "video") values.video_path = video.path;
  await supabase.from("site_content").update(values).eq("id", id).eq("workspace_id", access.workspaceId).eq("status", "draft");
  if (image || video) await supabase.from("site_content_assets").insert([image, video].filter(Boolean).map((asset) => ({ workspace_id: access.workspaceId, content_id: id, storage_path: asset!.path, asset_type: asset!.type, mime_type: asset!.mimeType, size_bytes: asset!.size, created_by: access.userId })));
  revalidatePath("/workspace/cms");
}

async function publishSiteContent(id: string) {
  "use server";
  const { supabase, access, allowed } = await cmsAccess("cms.publish");
  if (!allowed || !access.workspaceId) return;
  await supabase.from("site_content").update({ status: "active", published_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", access.workspaceId);
  revalidatePath("/workspace/cms");
  revalidatePath("/"); revalidatePath("/about"); revalidatePath("/services");
}

async function archiveSiteContent(id: string) {
  "use server";
  const { supabase, access, allowed } = await cmsAccess("cms.write");
  if (!allowed || !access.workspaceId) return;
  await supabase.from("site_content").update({ status: "archived", published_at: null }).eq("id", id).eq("workspace_id", access.workspaceId);
  revalidatePath("/workspace/cms");
  revalidatePath("/"); revalidatePath("/about"); revalidatePath("/services");
}

async function deleteSiteContent(id: string) {
  "use server";
  const { supabase, access, allowed } = await cmsAccess("cms.write");
  if (!allowed || !access.workspaceId) return;
  await supabase.from("site_content").delete().eq("id", id).eq("workspace_id", access.workspaceId);
  revalidatePath("/workspace/cms");
}

async function createAdvertisement(data: FormData) {
  "use server";
  if (data.get("mode") === "update") {
    await updateAdvertisement(data);
    return;
  }
  const title = text(data, "title");
  if (!title) return;
  const { supabase, access, allowed } = await cmsAccess("cms.write");
  if (!allowed || !access.workspaceId || !access.userId) return;
  const image = await uploadSiteAsset(supabase, data.get("image"), access.workspaceId, "advertisements");
  const video = await uploadSiteAsset(supabase, data.get("video"), access.workspaceId, "advertisements");
  await supabase.from("advertisements").insert({ workspace_id: access.workspaceId, title, body: text(data, "body") || null, cta_label: text(data, "ctaLabel") || null, cta_href: text(data, "ctaHref") || null, placement: text(data, "placement") || "portal_banner", priority: Number(data.get("priority") || 0), starts_at: text(data, "startsAt") || null, ends_at: text(data, "endsAt") || null, image_path: image?.type === "image" ? image.path : null, video_path: video?.type === "video" ? video.path : null, status: "draft", created_by: access.userId, updated_by: access.userId });
  revalidatePath("/workspace/cms");
}

async function updateAdvertisement(data: FormData) {
  "use server";
  const id = text(data, "id");
  const title = text(data, "title");
  if (!id || !title) return;
  const { supabase, access, allowed } = await cmsAccess("cms.write");
  if (!allowed || !access.workspaceId || !access.userId) return;
  const values = { title, body: text(data, "body") || null, cta_label: text(data, "ctaLabel") || null, cta_href: text(data, "ctaHref") || null, placement: text(data, "placement") || "portal_banner", priority: Number(data.get("priority") || 0), starts_at: text(data, "startsAt") || null, ends_at: text(data, "endsAt") || null, updated_by: access.userId };
  await supabase.from("advertisements").update(values).eq("id", id).eq("workspace_id", access.workspaceId).eq("status", "draft");
  revalidatePath("/workspace/cms");
}

async function publishAdvertisement(id: string) {
  "use server";
  const { supabase, access, allowed } = await cmsAccess("cms.publish");
  if (!allowed || !access.workspaceId) return;
  await supabase.from("advertisements").update({ status: "active", published_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", access.workspaceId);
  revalidatePath("/workspace/cms"); revalidatePath("/portal");
}

async function archiveAdvertisement(id: string) {
  "use server";
  const { supabase, access, allowed } = await cmsAccess("cms.write");
  if (!allowed || !access.workspaceId) return;
  await supabase.from("advertisements").update({ status: "archived", published_at: null }).eq("id", id).eq("workspace_id", access.workspaceId);
  revalidatePath("/workspace/cms"); revalidatePath("/portal");
}

async function deleteAdvertisement(id: string) {
  "use server";
  const { supabase, access, allowed } = await cmsAccess("cms.write");
  if (!allowed || !access.workspaceId) return;
  await supabase.from("advertisements").delete().eq("id", id).eq("workspace_id", access.workspaceId);
  revalidatePath("/workspace/cms");
}

export default async function CmsPage() {
  const supabase = await createClient();
  const [industries, services, caseStudies, insights, siteContent, advertisements] = await Promise.all([
    supabase.from("industries").select("id, name, slug, status, published_at").order("updated_at", { ascending: false }),
    supabase.from("services").select("id, title, slug, status, published_at").order("updated_at", { ascending: false }),
    supabase.from("case_studies").select("id, title, slug, status, published_at").order("updated_at", { ascending: false }),
    supabase.from("insights").select("id, title, slug, status, published_at").order("updated_at", { ascending: false }),
    supabase.from("site_content").select("id,content_key,page,section,eyebrow,title,body,cta_label,cta_href,image_path,video_path,status,published_at,updated_at").order("updated_at", { ascending: false }),
    supabase.from("advertisements").select("id,title,body,cta_label,cta_href,image_path,video_path,placement,priority,starts_at,ends_at,status,published_at,updated_at").order("updated_at", { ascending: false }),
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
      <div className="mt-8 grid gap-5 xl:grid-cols-2">{collections.map((collection) => <Card key={collection.kind} className="overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--betanor-border)] px-5 py-4"><h2 className="font-semibold text-[var(--betanor-navy)]">{collection.label}</h2><span className="text-sm text-[var(--betanor-muted)]">{collection.rows.length}</span></div>{collection.rows.length ? <ul className="divide-y divide-[var(--betanor-border)]">{collection.rows.map((row) => <li key={row.id} className="px-5 py-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{row.title}</p><p className="mt-1 truncate text-xs text-[var(--betanor-muted)]">/{row.slug}</p></div><div className="flex shrink-0 items-center gap-2"><Badge tone={row.status === "active" ? "success" : "draft"}>{row.status}</Badge><details className="relative"><summary className="cursor-pointer list-none rounded-lg border border-[var(--betanor-border)] px-3 py-1.5 text-xs font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-blue)]">Edit</summary><form action={updateContent} className="absolute top-9 right-0 z-10 grid w-64 gap-2 rounded-xl border border-[var(--betanor-border)] bg-white p-3 shadow-xl"><input type="hidden" name="kind" value={collection.kind}/><input type="hidden" name="id" value={row.id}/><Input name="title" defaultValue={row.title}/><Input name="slug" defaultValue={row.slug}/><Button type="submit" size="sm">Save changes</Button></form></details>{row.status !== "active" ? <form action={publishContent.bind(null, collection.kind, row.id)}><Button type="submit" size="sm">Publish</Button></form> : null}{row.status !== "archived" ? <form action={archiveContent.bind(null, collection.kind, row.id)}><Button type="submit" size="sm" variant="outline">Archive</Button></form> : null}{row.status !== "active" ? <form action={deleteContent.bind(null, collection.kind, row.id)}><Button type="submit" size="sm" variant="outline">Delete</Button></form> : null}</div></div></li>)}</ul> : <p className="px-5 py-8 text-sm text-[var(--betanor-muted)]">No {collection.label.toLowerCase()} have been created.</p>}</Card>)}</div>

      <Card className="mt-8 p-5 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">All public pages</p><h2 className="mt-2 text-xl font-semibold text-[var(--betanor-navy)]">Site content blocks</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">These records drive hero copy, sections, calls to action, links, and media on the customer-facing site.</p></div><Badge tone="info">{siteContent.data?.length ?? 0} blocks</Badge></div><form action={createSiteContent} encType="multipart/form-data" className="mt-6 grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold text-[var(--betanor-navy)]">Content key<Input name="contentKey" required placeholder="home.hero" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Page<Input name="page" required placeholder="home" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Section<Input name="section" required placeholder="hero" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Eyebrow<Input name="eyebrow" className="mt-2" /></label><label className="md:col-span-2 text-sm font-semibold text-[var(--betanor-navy)]">Title<Input name="title" required className="mt-2" /></label><label className="md:col-span-2 text-sm font-semibold text-[var(--betanor-navy)]">Body<textarea name="body" rows={4} className="mt-2 w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Button label<Input name="ctaLabel" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Button link<Input name="ctaHref" placeholder="/contact" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Image<input name="image" type="file" accept="image/*" className="mt-2 block w-full text-sm" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Video<input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" className="mt-2 block w-full text-sm" /></label><div className="md:col-span-2"><Button type="submit">Save content draft</Button></div></form><div className="mt-8 divide-y divide-[var(--betanor-border)] rounded-xl border border-[var(--betanor-border)]">{siteContent.data?.length ? siteContent.data.map((row) => <div key={row.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={row.status === "active" ? "success" : "draft"}>{row.status}</Badge><span className="text-xs font-semibold text-[var(--betanor-blue)]">{row.page} / {row.section}</span></div><p className="mt-2 text-sm font-semibold text-[var(--betanor-navy)]">{row.title}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">{row.content_key}{row.cta_href ? ` · ${row.cta_label || "Link"}: ${row.cta_href}` : ""}</p>{row.image_path ? <img src={publicSiteAssetUrl(row.image_path) ?? undefined} alt="" className="mt-3 h-16 w-24 rounded object-cover" /> : null}</div><div className="flex flex-wrap items-center gap-2"><details className="relative"><summary className="cursor-pointer list-none rounded-lg border border-[var(--betanor-border)] px-3 py-1.5 text-xs font-semibold">Edit</summary><form action={updateSiteContent} encType="multipart/form-data" className="absolute top-9 right-0 z-10 grid w-[min(90vw,24rem)] gap-2 rounded-xl border border-[var(--betanor-border)] bg-white p-3 shadow-xl"><input type="hidden" name="id" value={row.id}/><Input name="eyebrow" defaultValue={row.eyebrow ?? ""} placeholder="Eyebrow"/><Input name="title" required defaultValue={row.title ?? ""} placeholder="Title"/><textarea name="body" defaultValue={row.body ?? ""} rows={4} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="Body"/><Input name="ctaLabel" defaultValue={row.cta_label ?? ""} placeholder="Button label"/><Input name="ctaHref" defaultValue={row.cta_href ?? ""} placeholder="Button link"/><input name="image" type="file" accept="image/*"/><input name="video" type="file" accept="video/mp4,video/webm,video/quicktime"/><Button type="submit" size="sm">Save changes</Button></form></details>{row.status !== "active" ? <form action={publishSiteContent.bind(null, row.id)}><Button type="submit" size="sm">Publish</Button></form> : null}{row.status !== "archived" ? <form action={archiveSiteContent.bind(null, row.id)}><Button type="submit" size="sm" variant="outline">Archive</Button></form> : null}{row.status !== "active" ? <form action={deleteSiteContent.bind(null, row.id)}><Button type="submit" size="sm" variant="outline">Delete</Button></form> : null}</div></div>) : <p className="p-5 text-sm text-[var(--betanor-muted)]">No site content blocks yet.</p>}</div></Card>

      <Card className="mt-8 p-5 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Customer portal</p><h2 className="mt-2 text-xl font-semibold text-[var(--betanor-navy)]">Advertisements</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">Publish time-bound banners and promotions to authenticated customer dashboards.</p></div><Badge tone="info">{advertisements.data?.length ?? 0} ads</Badge></div><form action={createAdvertisement} encType="multipart/form-data" className="mt-6 grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold text-[var(--betanor-navy)]">Title<Input name="title" required className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Placement<select name="placement" className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="portal_banner">Portal banner</option><option value="portal_card">Portal card</option><option value="public_home">Public home</option><option value="public_services">Public services</option></select></label><label className="md:col-span-2 text-sm font-semibold text-[var(--betanor-navy)]">Message<textarea name="body" rows={3} className="mt-2 w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Button label<Input name="ctaLabel" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Button link<Input name="ctaHref" placeholder="/services" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Starts at<Input name="startsAt" type="datetime-local" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Ends at<Input name="endsAt" type="datetime-local" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Priority<Input name="priority" type="number" defaultValue="0" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Image<input name="image" type="file" accept="image/*" className="mt-2 block w-full text-sm" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Video<input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" className="mt-2 block w-full text-sm" /></label><div className="md:col-span-2"><Button type="submit">Save advertisement draft</Button></div></form><div className="mt-8 divide-y divide-[var(--betanor-border)] rounded-xl border border-[var(--betanor-border)]">{advertisements.data?.length ? advertisements.data.map((ad) => <div key={ad.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={ad.status === "active" ? "success" : "draft"}>{ad.status}</Badge><span className="text-xs font-semibold text-[var(--betanor-blue)]">{ad.placement}</span></div><p className="mt-2 text-sm font-semibold text-[var(--betanor-navy)]">{ad.title}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">{ad.cta_href || "No call to action"}{ad.starts_at ? ` · from ${new Date(ad.starts_at).toLocaleString()}` : ""}{ad.ends_at ? ` · until ${new Date(ad.ends_at).toLocaleString()}` : ""}</p></div><div className="flex flex-wrap items-center gap-2">{ad.status !== "active" ? <form action={publishAdvertisement.bind(null, ad.id)}><Button type="submit" size="sm">Publish</Button></form> : null}{ad.status !== "archived" ? <form action={archiveAdvertisement.bind(null, ad.id)}><Button type="submit" size="sm" variant="outline">Archive</Button></form> : null}{ad.status !== "active" ? <form action={deleteAdvertisement.bind(null, ad.id)}><Button type="submit" size="sm" variant="outline">Delete</Button></form> : null}</div></div>) : <p className="p-5 text-sm text-[var(--betanor-muted)]">No advertisements yet.</p>}</div></Card>
    </>}
  </main>;
}
