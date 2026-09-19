import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/lib/env";

export type SiteContent = {
  id: string;
  content_key: string;
  page: string;
  section: string;
  eyebrow: string | null;
  title: string | null;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  image_path: string | null;
  video_path: string | null;
  metadata: Record<string, unknown>;
};

const fields = "id,content_key,page,section,eyebrow,title,body,cta_label,cta_href,image_path,video_path,metadata";

export async function getPublicContent(supabase: SupabaseClient, page: string) {
  const { data } = await supabase
    .from("site_content")
    .select(fields)
    .eq("page", page)
    .eq("status", "active")
    .not("published_at", "is", null)
    .order("section");

  const map = new Map<string, SiteContent>();
  for (const row of (data ?? []) as SiteContent[]) map.set(row.section, row);
  return map;
}

export function publicSiteAssetUrl(path: string | null | undefined) {
  if (!path) return null;
  const { NEXT_PUBLIC_SUPABASE_URL } = getSupabasePublicConfig();
  return `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/betanor-site-assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}
