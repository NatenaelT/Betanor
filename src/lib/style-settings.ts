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
export type RadiusScale = "compact" | "medium" | "soft";

export type StyleSettings = {
  font_family: StyleFontFamily;
  heading_font_family: StyleFontFamily;
  primary_color: string;
  accent_color: string;
  surface_color: string;
  text_color: string;
  nav_color: string;
  nav_text_color: string;
  header_color: string;
  header_text_color: string;
  footer_color: string;
  footer_text_color: string;
  button_color: string;
  button_text_color: string;
  field_background_color: string;
  field_text_color: string;
  field_border_color: string;
  field_focus_color: string;
  radius_scale: RadiusScale;
};

export const DEFAULT_STYLE_SETTINGS: StyleSettings = {
  font_family: "Inter",
  heading_font_family: "Manrope",
  primary_color: "#12356B",
  accent_color: "#D8A33A",
  surface_color: "#F4F7FB",
  text_color: "#17243A",
  nav_color: "#0B264F",
  nav_text_color: "#E8F0FF",
  header_color: "#FFFFFF",
  header_text_color: "#12356B",
  footer_color: "#0B264F",
  footer_text_color: "#D5E1F2",
  button_color: "#12356B",
  button_text_color: "#FFFFFF",
  field_background_color: "#FFFFFF",
  field_text_color: "#17243A",
  field_border_color: "#D9E1EC",
  field_focus_color: "#2188FF",
  radius_scale: "medium",
};

const STYLE_COLUMNS = "font_family,heading_font_family,primary_color,accent_color,surface_color,text_color,nav_color,nav_text_color,header_color,header_text_color,footer_color,footer_text_color,button_color,button_text_color,field_background_color,field_text_color,field_border_color,field_focus_color,radius_scale";
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
  return typeof value === "string" && (STYLE_FONT_FAMILIES as readonly string[]).includes(value) ? value as StyleFontFamily : fallback;
}

function safeColor(value: unknown, fallback: string) {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toUpperCase() : fallback;
}

export function normalizeStyleSettings(value: Partial<StyleSettings> | null | undefined): StyleSettings {
  const radius = value?.radius_scale;
  return {
    font_family: safeFont(value?.font_family, DEFAULT_STYLE_SETTINGS.font_family),
    heading_font_family: safeFont(value?.heading_font_family, DEFAULT_STYLE_SETTINGS.heading_font_family),
    primary_color: safeColor(value?.primary_color, DEFAULT_STYLE_SETTINGS.primary_color),
    accent_color: safeColor(value?.accent_color, DEFAULT_STYLE_SETTINGS.accent_color),
    surface_color: safeColor(value?.surface_color, DEFAULT_STYLE_SETTINGS.surface_color),
    text_color: safeColor(value?.text_color, DEFAULT_STYLE_SETTINGS.text_color),
    nav_color: safeColor(value?.nav_color, DEFAULT_STYLE_SETTINGS.nav_color),
    nav_text_color: safeColor(value?.nav_text_color, DEFAULT_STYLE_SETTINGS.nav_text_color),
    header_color: safeColor(value?.header_color, DEFAULT_STYLE_SETTINGS.header_color),
    header_text_color: safeColor(value?.header_text_color, DEFAULT_STYLE_SETTINGS.header_text_color),
    footer_color: safeColor(value?.footer_color, DEFAULT_STYLE_SETTINGS.footer_color),
    footer_text_color: safeColor(value?.footer_text_color, DEFAULT_STYLE_SETTINGS.footer_text_color),
    button_color: safeColor(value?.button_color, DEFAULT_STYLE_SETTINGS.button_color),
    button_text_color: safeColor(value?.button_text_color, DEFAULT_STYLE_SETTINGS.button_text_color),
    field_background_color: safeColor(value?.field_background_color, DEFAULT_STYLE_SETTINGS.field_background_color),
    field_text_color: safeColor(value?.field_text_color, DEFAULT_STYLE_SETTINGS.field_text_color),
    field_border_color: safeColor(value?.field_border_color, DEFAULT_STYLE_SETTINGS.field_border_color),
    field_focus_color: safeColor(value?.field_focus_color, DEFAULT_STYLE_SETTINGS.field_focus_color),
    radius_scale: radius === "compact" || radius === "soft" ? radius : DEFAULT_STYLE_SETTINGS.radius_scale,
  };
}

export async function loadStyleSettings(supabase: SupabaseClient) {
  try {
    const { data: theme } = await supabase.from("workspace_themes").select(STYLE_COLUMNS).eq("is_active", true).limit(1).maybeSingle();
    if (theme) return normalizeStyleSettings(theme);
    const { data: legacy } = await supabase.from("workspace_style_settings").select("font_family,heading_font_family,primary_color,accent_color,surface_color,text_color,radius_scale").limit(1).maybeSingle();
    return normalizeStyleSettings(legacy);
  } catch {
    return DEFAULT_STYLE_SETTINGS;
  }
}

export function googleFontsHref(settings: Pick<StyleSettings, "font_family" | "heading_font_family">) {
  const families = Array.from(new Set([settings.font_family, settings.heading_font_family]));
  return `https://fonts.googleapis.com/css2?${families.map((family) => `family=${FONT_URL_NAMES[family]}`).join("&")}&display=swap`;
}

export const STYLE_COLOR_FIELDS = [
  ["primary_color", "Primary"], ["accent_color", "Accent"], ["surface_color", "Surface"], ["text_color", "Text"],
  ["nav_color", "Navigation background"], ["nav_text_color", "Navigation text"], ["header_color", "Header background"], ["header_text_color", "Header text"],
  ["footer_color", "Footer background"], ["footer_text_color", "Footer text"], ["button_color", "Button background"], ["button_text_color", "Button text"],
  ["field_background_color", "Field background"], ["field_text_color", "Field text"], ["field_border_color", "Field border"], ["field_focus_color", "Field focus"],
] as const;

export { STYLE_COLUMNS, HEX_COLOR };
