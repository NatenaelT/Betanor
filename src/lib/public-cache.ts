import { unstable_cache } from "next/cache";
import { createClient as createAnonClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/lib/env";
import { loadStyleSettings, type StyleSettings } from "@/lib/style-settings";
import type { SiteContent } from "@/lib/site-content";

function publicSupabase(): SupabaseClient {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = getSupabasePublicConfig();
  return createAnonClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const cachedStyleSettings = unstable_cache(
  async (): Promise<StyleSettings> => loadStyleSettings(publicSupabase()),
  ["betanor-public-style-settings"],
  { revalidate: 60, tags: ["betanor-public-style-settings"] },
);

const cachedContentRows = unstable_cache(
  async (page: string): Promise<SiteContent[]> => {
    const { data } = await publicSupabase()
      .from("site_content")
      .select("id,content_key,page,section,eyebrow,title,body,cta_label,cta_href,image_path,video_path,metadata")
      .eq("page", page)
      .eq("status", "active")
      .not("published_at", "is", null)
      .order("section");
    return (data ?? []) as SiteContent[];
  },
  ["betanor-public-content"],
  { revalidate: 60, tags: ["betanor-public-content"] },
);

const cachedServicesCatalogue = unstable_cache(
  async () => {
    const supabase = publicSupabase();
    const [services, products, industries, caseStudies] = await Promise.all([
      supabase.from("services").select("id,title,slug,excerpt,content").eq("status", "active").not("published_at", "is", null).order("title"),
      supabase.from("products").select("id,name,slug,brand,model,short_description,availability,warranty,main_image_path,product_categories(name)").eq("status", "active").not("published_at", "is", null).order("name"),
      supabase.from("industries").select("id,name,slug,description").eq("status", "active").not("published_at", "is", null).order("name"),
      supabase.from("case_studies").select("id,title,slug,summary").eq("status", "active").not("published_at", "is", null).order("title"),
    ]);
    return {
      services: services.data ?? [],
      products: products.data ?? [],
      industries: industries.data ?? [],
      caseStudies: caseStudies.data ?? [],
    };
  },
  ["betanor-public-services-catalogue"],
  { revalidate: 60, tags: ["betanor-public-services-catalogue"] },
);

const cachedIndustries = unstable_cache(
  async () => {
    const { data } = await publicSupabase().from("industries").select("name,description").eq("status", "active").not("published_at", "is", null).order("name");
    return data ?? [];
  },
  ["betanor-public-industries"],
  { revalidate: 60, tags: ["betanor-public-industries"] },
);

const cachedInsights = unstable_cache(
  async () => {
    const { data } = await publicSupabase().from("insights").select("title,excerpt,content").eq("status", "active").not("published_at", "is", null).order("title");
    return data ?? [];
  },
  ["betanor-public-insights"],
  { revalidate: 60, tags: ["betanor-public-insights"] },
);

export async function loadCachedStyleSettings() {
  return cachedStyleSettings();
}

export async function getCachedPublicContent(page: string) {
  const rows = await cachedContentRows(page);
  return new Map(rows.map((row) => [row.section, row]));
}

export async function getCachedServicesCatalogue() {
  return cachedServicesCatalogue();
}

export async function getCachedIndustries() {
  return cachedIndustries();
}

export async function getCachedInsights() {
  return cachedInsights();
}
