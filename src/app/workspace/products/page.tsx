import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function createCategory(formData: FormData) {
  "use server";
  const name = text(formData, "name");
  const slug = text(formData, "slug").toLowerCase();
  const description = text(formData, "description");
  if (!name || !slug) return;

  const supabase = await createClient();
  await supabase.from("product_categories").insert({ name, slug, description, status: "draft" });
  revalidatePath("/workspace/products");
}

async function createProduct(formData: FormData) {
  "use server";
  const name = text(formData, "name");
  const slug = text(formData, "slug").toLowerCase();
  if (!name || !slug) return;

  const categoryId = text(formData, "categoryId") || null;
  const supabase = await createClient();
  await supabase.from("products").insert({
    category_id: categoryId,
    name,
    slug,
    sku: text(formData, "sku") || null,
    brand: text(formData, "brand") || null,
    model: text(formData, "model") || null,
    short_description: text(formData, "shortDescription") || null,
    availability: text(formData, "availability") || null,
    warranty: text(formData, "warranty") || null,
    status: "draft",
  });
  revalidatePath("/workspace/products");
}

async function publishCatalogueItem(table: "product_categories" | "products", id: string) {
  "use server";
  const supabase = await createClient();
  await supabase.from(table).update({ status: "active", published_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/workspace/products");
  revalidatePath("/products");
}

async function archiveCatalogueItem(table: "product_categories" | "products", id: string) {
  "use server";
  const supabase = await createClient();
  await supabase.from(table).update({ status: "archived", published_at: null }).eq("id", id);
  revalidatePath("/workspace/products");
  revalidatePath("/products");
}

export default async function ProductCataloguePage() {
  const supabase = await createClient();
  const [categories, products] = await Promise.all([
    supabase.from("product_categories").select("id, name, slug, status, published_at").order("updated_at", { ascending: false }),
    supabase.from("products").select("id, name, slug, sku, brand, model, status, published_at, product_categories(name)").order("updated_at", { ascending: false }),
  ]);
  const canRead = !categories.error && !products.error;

  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Product catalogue</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Organize what Betanor offers.</h1><p className="mt-3 max-w-2xl text-base leading-7 text-[var(--betanor-muted)]">Maintain accurate catalogue information before it appears on the public website or in commercial conversations.</p></div><Badge tone="info">Draft-controlled</Badge></div>
    {!canRead ? <Card className="mt-8 p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Catalogue access is required</h2><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">Ask an administrator to assign the CMS reader, writer, or publisher capability to your account.</p></Card> : <>
      <div className="mt-8 grid gap-5 xl:grid-cols-2">
        <Card className="p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Create category draft</h2><form action={createCategory} className="mt-5 grid gap-4"><label className="text-sm font-semibold text-[var(--betanor-navy)]">Category name<Input name="name" required className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Slug<Input name="slug" required pattern="[a-z0-9-]+" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Description<textarea name="description" rows={3} className="mt-2 w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm outline-none focus:border-[var(--betanor-electric-blue)] focus:ring-2 focus:ring-blue-100" /></label><Button type="submit" className="w-fit">Save category draft</Button></form></Card>
        <Card className="p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Create product draft</h2><form action={createProduct} className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold text-[var(--betanor-navy)]">Product name<Input name="name" required className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Slug<Input name="slug" required pattern="[a-z0-9-]+" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Category<select name="categoryId" className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Uncategorized</option>{categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Brand<Input name="brand" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Model<Input name="model" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">SKU<Input name="sku" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Availability<Input name="availability" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Warranty<Input name="warranty" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)] md:col-span-2">Short description<textarea name="shortDescription" rows={3} className="mt-2 w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm outline-none focus:border-[var(--betanor-electric-blue)] focus:ring-2 focus:ring-blue-100" /></label><div className="md:col-span-2"><Button type="submit">Save product draft</Button></div></form></Card>
      </div>
      <div className="mt-8 grid gap-5 xl:grid-cols-2"><CatalogueCollection label="Categories" rows={categories.data ?? []} table="product_categories" /><CatalogueCollection label="Products" rows={products.data ?? []} table="products" /></div>
    </>}
  </main>;
}

function CatalogueCollection({ label, rows, table }: { label: string; rows: Array<{ id: string; name: string; slug: string; status: string; published_at: string | null; sku?: string | null; brand?: string | null; model?: string | null; product_categories?: Array<{ name: string }> | null }>; table: "product_categories" | "products" }) {
  return <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--betanor-border)] px-5 py-4"><h2 className="font-semibold text-[var(--betanor-navy)]">{label}</h2><span className="text-sm text-[var(--betanor-muted)]">{rows.length}</span></div>{rows.length ? <ul className="divide-y divide-[var(--betanor-border)]">{rows.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{row.name}</p><p className="mt-1 truncate text-xs text-[var(--betanor-muted)]">{row.brand ? `${row.brand}${row.model ? ` · ${row.model}` : ""} · ` : ""}/{row.slug}{row.product_categories?.[0]?.name ? ` · ${row.product_categories[0].name}` : ""}</p></div><div className="flex shrink-0 items-center gap-2"><Badge tone={row.status === "active" ? "success" : "draft"}>{row.status}</Badge>{row.status !== "active" ? <form action={publishCatalogueItem.bind(null, table, row.id)}><Button type="submit" size="sm">Publish</Button></form> : null}{row.status !== "archived" ? <form action={archiveCatalogueItem.bind(null, table, row.id)}><Button type="submit" size="sm" variant="outline">Archive</Button></form> : null}</div></li>)}</ul> : <p className="px-5 py-8 text-sm text-[var(--betanor-muted)]">No {label.toLowerCase()} have been created.</p>}</Card>;
}
