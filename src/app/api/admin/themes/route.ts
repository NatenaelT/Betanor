import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_STYLE_SETTINGS, normalizeStyleSettings } from "@/lib/style-settings";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

const THEME_COLUMNS = "id,workspace_id,name,template_key,font_family,heading_font_family,primary_color,accent_color,surface_color,text_color,nav_color,nav_text_color,header_color,header_text_color,footer_color,footer_text_color,button_color,button_text_color,field_background_color,field_text_color,field_border_color,field_focus_color,radius_scale,is_active,created_at,updated_at";
const COLOR_KEYS = ["nav_color", "nav_text_color", "header_color", "header_text_color", "footer_color", "footer_text_color", "button_color", "button_text_color", "field_background_color", "field_text_color", "field_border_color", "field_focus_color"] as const;

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function isHex(value: unknown): value is string { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value); }
function isSuperAdmin(access: Awaited<ReturnType<typeof resolveWorkspace>>) { return Boolean(access.workspaceId && access.roleCodes.has("SUPER_ADMIN")); }

function stylePayload(body: Record<string, unknown>, existing?: Record<string, unknown>) {
  const merged = { ...DEFAULT_STYLE_SETTINGS, ...(existing ?? {}), ...body };
  const normalized = normalizeStyleSettings(merged);
  for (const key of COLOR_KEYS) if (!isHex(merged[key])) return null;
  return { ...normalized, ...Object.fromEntries(COLOR_KEYS.map((key) => [key, String(merged[key]).toUpperCase()])) };
}

async function authContext() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  return { supabase, access };
}

export async function GET() {
  const { supabase, access } = await authContext();
  if (!isSuperAdmin(access)) return NextResponse.json({ error: "Super Admin style access is required." }, { status: 403 });
  const { data, error } = await supabase.from("workspace_themes").select(THEME_COLUMNS).eq("workspace_id", access.workspaceId).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ themes: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, access } = await authContext();
  if (!isSuperAdmin(access)) return NextResponse.json({ error: "Super Admin style access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const name = text(body.name);
  if (name.length < 2 || name.length > 60) return NextResponse.json({ error: "Theme name must be between 2 and 60 characters." }, { status: 422 });
  const payload = stylePayload(body);
  if (!payload) return NextResponse.json({ error: "Every theme color must be a six-digit hex value." }, { status: 422 });
  const isActive = body.isActive === true;
  if (isActive) await supabase.from("workspace_themes").update({ is_active: false, updated_at: new Date().toISOString() }).eq("workspace_id", access.workspaceId);
  const { data, error } = await supabase.from("workspace_themes").insert({ workspace_id: access.workspaceId, name, template_key: text(body.templateKey) || "custom", ...payload, is_active: isActive, created_by: access.userId, updated_by: access.userId }).select(THEME_COLUMNS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ theme: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { supabase, access } = await authContext();
  if (!isSuperAdmin(access)) return NextResponse.json({ error: "Super Admin style access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = text(body.id);
  if (!id) return NextResponse.json({ error: "A theme is required." }, { status: 422 });
  const { data: existing, error: existingError } = await supabase.from("workspace_themes").select(THEME_COLUMNS).eq("id", id).eq("workspace_id", access.workspaceId).maybeSingle();
  if (existingError || !existing) return NextResponse.json({ error: existingError?.message || "Theme not found." }, { status: 404 });
  const name = text(body.name) || existing.name;
  if (name.length < 2 || name.length > 60) return NextResponse.json({ error: "Theme name must be between 2 and 60 characters." }, { status: 422 });
  const payload = stylePayload(body, existing);
  if (!payload) return NextResponse.json({ error: "Every theme color must be a six-digit hex value." }, { status: 422 });
  const isActive = body.isActive === true;
  if (!isActive && existing.is_active) return NextResponse.json({ error: "Apply another theme before deactivating this theme." }, { status: 409 });
  if (isActive) await supabase.from("workspace_themes").update({ is_active: false, updated_at: new Date().toISOString() }).eq("workspace_id", access.workspaceId).neq("id", id);
  const { data, error } = await supabase.from("workspace_themes").update({ name, template_key: text(body.templateKey) || existing.template_key || "custom", ...payload, is_active: isActive, updated_by: access.userId, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", access.workspaceId).select(THEME_COLUMNS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ theme: data });
}

export async function DELETE(request: Request) {
  const { supabase, access } = await authContext();
  if (!isSuperAdmin(access)) return NextResponse.json({ error: "Super Admin style access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const id = text(body.id);
  if (!id) return NextResponse.json({ error: "A theme is required." }, { status: 422 });
  const { data: theme } = await supabase.from("workspace_themes").select("id,is_active").eq("id", id).eq("workspace_id", access.workspaceId).maybeSingle();
  if (!theme) return NextResponse.json({ error: "Theme not found." }, { status: 404 });
  if (theme.is_active) return NextResponse.json({ error: "The active theme cannot be deleted. Apply another theme first." }, { status: 409 });
  const { count } = await supabase.from("workspace_themes").select("id", { count: "exact", head: true }).eq("workspace_id", access.workspaceId);
  if ((count ?? 0) <= 1) return NextResponse.json({ error: "Keep at least one theme in the workspace." }, { status: 409 });
  const { error } = await supabase.from("workspace_themes").delete().eq("id", id).eq("workspace_id", access.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ deleted: true });
}
