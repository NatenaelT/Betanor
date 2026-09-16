import type { SupabaseClient } from "@supabase/supabase-js";

export const STYLE_FONT_FAMILIES = [
  "Inter",
  "Manrope",
  "Plus Jakarta Sans",
  "DM Sans",
  "Roboto",
  "Source Sans 3",
  "Noto Sans Ethiopic",
] as const;

export type StyleFontFamily = (typeof STYLE_FONT_FAMILIES)[number];

export const DEFAULT_STYLE_SETTINGS = {
  font_family: "Inter" as StyleFontFamily,
  heading_font_family: "Manrope" as StyleFontFamily,
  primary_color: "#12356B",
  accent_color: "#D8A33A",
  surface_color: "#F4F7FB",
  text_color: "#17243A",
  radius_scale: "medium" as "compact" | "medium" | "soft",
};

const FONT_URL_NAMES: Record<StyleFontFamily, string> = {
  Inter: "Inter:wght@400;500;600;700",
  Manrope: "Manrope:wght@400;500;600;700",
  "Plus Jakarta Sans": "Plus+Jakarta+Sans:wght@400;500;600;700",
  "DM Sans": "DM+Sans:wght@400;500;600;700",
  Roboto: "Roboto:wght@400;500;700",
  "Source Sans 3": "Source+Sans+3:wght@400;500;600;700",
  "Noto Sans Ethiopic": "Noto+Sans+Ethiopic:wght@400;500;600;700",
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function safeFont(value: unknown, fallback: StyleFontFamily): StyleFontFamily {
  return typeof value === "string" && (STYLE_FONT_FAMILIES as readonly string[]).includes(value)
    ? value as StyleFontFamily
    : fallback;
}

function safeColor(value: unknown, fallback: string) {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toUpperCase() : fallback;
}

export function normalizeStyleSettings(value: Partial<typeof DEFAULT_STYLE_SETTINGS> | null | undefined) {
  const radius = value?.radius_scale;
  return {
    font_family: safeFont(value?.font_family, DEFAULT_STYLE_SETTINGS.font_family),
    heading_font_family: safeFont(value?.heading_font_family, DEFAULT_STYLE_SETTINGS.heading_font_family),
    primary_color: safeColor(value?.primary_color, DEFAULT_STYLE_SETTINGS.primary_color),
    accent_color: safeColor(value?.accent_color, DEFAULT_STYLE_SETTINGS.accent_color),
    surface_color: safeColor(value?.surface_color, DEFAULT_STYLE_SETTINGS.surface_color),
    text_color: safeColor(value?.text_color, DEFAULT_STYLE_SETTINGS.text_color),
    radius_scale: radius === "compact" || radius === "soft" ? radius : DEFAULT_STYLE_SETTINGS.radius_scale,
  };
}

export async function loadStyleSettings(supabase: SupabaseClient) {
  try {
    const { data } = await supabase.from("workspace_style_settings").select("font_family,heading_font_family,primary_color,accent_color,surface_color,text_color,radius_scale").limit(1).maybeSingle();
    return normalizeStyleSettings(data);
  } catch {
    return DEFAULT_STYLE_SETTINGS;
  }
}

export function googleFontsHref(settings: Pick<typeof DEFAULT_STYLE_SETTINGS, "font_family" | "heading_font_family">) {
  const families = Array.from(new Set([settings.font_family, settings.heading_font_family]));
  return `https://fonts.googleapis.com/css2?${families.map((family) => `family=${FONT_URL_NAMES[family]}`).join("&")}&display=swap`;
}
