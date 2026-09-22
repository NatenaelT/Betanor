import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function accessLevel(value: unknown) {
  return value === "customer_viewer" ? "customer_viewer" : "customer_admin";
}

async function context() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  return { supabase, access, canManage: Boolean(access.workspaceId && access.permissions.has("users.manage")) };
}

async function scopedCustomer(supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string, customerId: string) {
  const { data, error } = await supabase.from("customers").select("id,name,legal_name,email,phone,status").eq("id", customerId).eq("workspace_id", workspaceId).maybeSingle();
  return { data, error };
}

async function scopedProfile(supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string, profileId: string) {
  const { data, error } = await supabase.from("profiles").select("id,full_name,email_address,account_type,is_active,workspace_id").eq("id", profileId).eq("workspace_id", workspaceId).maybeSingle();
  return { data, error };
}

export async function GET() {
  const { supabase, access, canManage } = await context();
  if (!canManage || !access.workspaceId) return NextResponse.json({ error: "Customer portal administration access is required." }, { status: 403 });
  const [{ data: accessRows, error: accessError }, { data: customers, error: customersError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase.from("customer_portal_access").select("id,customer_id,profile_id,access_level,is_active,created_at,updated_at,customers(id,name,legal_name,email,phone,status),profiles(id,full_name,email_address,account_type,is_active)").eq("workspace_id", access.workspaceId).order("created_at", { ascending: false }),
    supabase.from("customers").select("id,name,legal_name,email,phone,status").eq("workspace_id", access.workspaceId).order("name"),
    supabase.from("profiles").select("id,full_name,email_address,account_type,is_active,workspace_id").eq("workspace_id", access.workspaceId).eq("is_active", true).order("full_name"),
  ]);
  const error = accessError || customersError || profilesError;
  if (error) return NextResponse.json({ error: error.message || "Could not load customer portal access." }, { status: 400 });
  return NextResponse.json({ access: accessRows ?? [], customers: customers ?? [], profiles: profiles ?? [] });
}

export async function POST(request: Request) {
  const { supabase, access, canManage } = await context();
  if (!canManage || !access.workspaceId) return NextResponse.json({ error: "Customer portal administration access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const customerId = text(body.customerId);
  const profileId = text(body.profileId);
  if (!customerId || !profileId) return NextResponse.json({ error: "Choose both a customer and a portal profile." }, { status: 422 });
  const [{ data: customer, error: customerError }, { data: profile, error: profileError }] = await Promise.all([
    scopedCustomer(supabase, access.workspaceId, customerId),
    scopedProfile(supabase, access.workspaceId, profileId),
  ]);
  if (customerError || !customer) return NextResponse.json({ error: customerError?.message || "Customer not found in this workspace." }, { status: 404 });
  if (profileError || !profile) return NextResponse.json({ error: profileError?.message || "Portal profile not found in this workspace." }, { status: 404 });
  const { data: existing } = await supabase.from("customer_portal_access").select("id").eq("workspace_id", access.workspaceId).eq("customer_id", customerId).eq("profile_id", profileId).maybeSingle();
  if (existing?.id) return NextResponse.json({ error: "This profile already has access to that customer portal." }, { status: 409 });
  const { data, error } = await supabase.from("customer_portal_access").insert({ workspace_id: access.workspaceId, customer_id: customerId, profile_id: profileId, access_level: accessLevel(body.accessLevel), is_active: body.isActive !== false }).select("id,customer_id,profile_id,access_level,is_active,created_at,updated_at").single();
  if (error) return NextResponse.json({ error: error.message || "Could not create customer portal access." }, { status: 400 });
  return NextResponse.json({ access: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { supabase, access, canManage } = await context();
  if (!canManage || !access.workspaceId) return NextResponse.json({ error: "Customer portal administration access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body.id);
  if (!id) return NextResponse.json({ error: "A portal access record is required." }, { status: 422 });
  const patch: Record<string, unknown> = {};
  if (body.accessLevel !== undefined) patch.access_level = accessLevel(body.accessLevel);
  if (body.isActive !== undefined) patch.is_active = body.isActive === true;
  if (body.customerId !== undefined) patch.customer_id = text(body.customerId);
  if (body.profileId !== undefined) patch.profile_id = text(body.profileId);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "No portal access changes were provided." }, { status: 422 });
  if (patch.customer_id) {
    const { data: customer } = await scopedCustomer(supabase, access.workspaceId, String(patch.customer_id));
    if (!customer) return NextResponse.json({ error: "Customer not found in this workspace." }, { status: 404 });
  }
  if (patch.profile_id) {
    const { data: profile } = await scopedProfile(supabase, access.workspaceId, String(patch.profile_id));
    if (!profile) return NextResponse.json({ error: "Portal profile not found in this workspace." }, { status: 404 });
  }
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from("customer_portal_access").update(patch).eq("id", id).eq("workspace_id", access.workspaceId).select("id,customer_id,profile_id,access_level,is_active,created_at,updated_at").maybeSingle();
  if (error) return NextResponse.json({ error: error.message || "Could not update customer portal access." }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Customer portal access record not found." }, { status: 404 });
  return NextResponse.json({ access: data });
}

export async function DELETE(request: Request) {
  const { supabase, access, canManage } = await context();
  if (!canManage || !access.workspaceId) return NextResponse.json({ error: "Customer portal administration access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body.id);
  if (!id) return NextResponse.json({ error: "A portal access record is required." }, { status: 422 });
  const { error } = await supabase.from("customer_portal_access").delete().eq("id", id).eq("workspace_id", access.workspaceId);
  if (error) return NextResponse.json({ error: error.message || "Could not remove customer portal access." }, { status: 400 });
  return NextResponse.json({ deleted: true });
}
