import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

type Entity = "department" | "position";

async function context() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  const canManage = access.permissions.has("settings.manage") || access.permissions.has("hr.manage") || access.permissions.has("users.manage");
  return { supabase, access, canManage };
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function entity(value: unknown): Entity | null { return value === "department" || value === "position" ? value : null; }

export async function GET() {
  const { supabase, access, canManage } = await context();
  if (!canManage || !access.workspaceId) return NextResponse.json({ error: "Organization management access is required." }, { status: 403 });
  const [{ data: departments, error: departmentError }, { data: positions, error: positionError }] = await Promise.all([
    supabase.from("departments").select("id,name,code,status,parent_id").eq("workspace_id", access.workspaceId).order("name"),
    supabase.from("positions").select("id,title,code,status,department_id").eq("workspace_id", access.workspaceId).order("title"),
  ]);
  if (departmentError || positionError) return NextResponse.json({ error: departmentError?.message || positionError?.message || "Could not load organization structure." }, { status: 400 });
  return NextResponse.json({ departments: departments ?? [], positions: positions ?? [] });
}

export async function POST(request: Request) {
  const { supabase, access, canManage } = await context();
  if (!canManage || !access.workspaceId) return NextResponse.json({ error: "Organization management access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const kind = entity(body.entity);
  if (!kind) return NextResponse.json({ error: "Choose a department or position." }, { status: 422 });
  if (kind === "department") {
    const name = text(body.name);
    if (name.length < 2) return NextResponse.json({ error: "Department name must be at least two characters." }, { status: 422 });
    const { data, error } = await supabase.from("departments").insert({ workspace_id: access.workspaceId, name, code: text(body.code) || null, parent_id: text(body.parentId) || null }).select("id,name,code,status,parent_id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ department: data }, { status: 201 });
  }
  const title = text(body.title);
  const departmentId = text(body.departmentId);
  if (title.length < 2 || !departmentId) return NextResponse.json({ error: "Position title and department are required." }, { status: 422 });
  const { data: department } = await supabase.from("departments").select("id").eq("id", departmentId).eq("workspace_id", access.workspaceId).maybeSingle();
  if (!department) return NextResponse.json({ error: "Select a department from this workspace." }, { status: 422 });
  const { data, error } = await supabase.from("positions").insert({ workspace_id: access.workspaceId, title, code: text(body.code) || null, department_id: departmentId }).select("id,title,code,status,department_id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ position: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { supabase, access, canManage } = await context();
  if (!canManage || !access.workspaceId) return NextResponse.json({ error: "Organization management access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const kind = entity(body.entity);
  const id = text(body.id);
  if (!kind || !id) return NextResponse.json({ error: "A valid record is required." }, { status: 422 });
  if (kind === "department") {
    const name = text(body.name);
    if (name.length < 2) return NextResponse.json({ error: "Department name must be at least two characters." }, { status: 422 });
    const { data, error } = await supabase.from("departments").update({ name, parent_id: text(body.parentId) || null, status: body.status === "inactive" ? "inactive" : "active" }).eq("id", id).eq("workspace_id", access.workspaceId).select("id,name,code,status,parent_id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Department not found." }, { status: 404 });
    return NextResponse.json({ department: data });
  }
  const title = text(body.title);
  const departmentId = text(body.departmentId);
  if (title.length < 2 || !departmentId) return NextResponse.json({ error: "Position title and department are required." }, { status: 422 });
  const { data: department } = await supabase.from("departments").select("id").eq("id", departmentId).eq("workspace_id", access.workspaceId).maybeSingle();
  if (!department) return NextResponse.json({ error: "Select a department from this workspace." }, { status: 422 });
  const positionPatch: { title: string; department_id: string; status: "active" | "inactive"; code?: string } = { title, department_id: departmentId, status: body.status === "inactive" ? "inactive" : "active" };
  const code = text(body.code);
  if (code) positionPatch.code = code.toUpperCase();
  const { data, error } = await supabase.from("positions").update(positionPatch).eq("id", id).eq("workspace_id", access.workspaceId).select("id,title,code,status,department_id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Position not found." }, { status: 404 });
  return NextResponse.json({ position: data });
}

export async function DELETE(request: Request) {
  const { supabase, access, canManage } = await context();
  if (!canManage || !access.workspaceId) return NextResponse.json({ error: "Organization management access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const kind = entity(body.entity);
  const id = text(body.id);
  if (!kind || !id) return NextResponse.json({ error: "A valid record is required." }, { status: 422 });
  if (kind === "department") {
    const [positions, employees, goals, budgets, expenses, openings] = await Promise.all([
      supabase.from("positions").select("id", { count: "exact", head: true }).eq("department_id", id),
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("department_id", id),
      supabase.from("department_goals").select("id", { count: "exact", head: true }).eq("department_id", id),
      supabase.from("budgets").select("id", { count: "exact", head: true }).eq("department_id", id),
      supabase.from("expenses").select("id", { count: "exact", head: true }).eq("department_id", id),
      supabase.from("job_openings").select("id", { count: "exact", head: true }).eq("department_id", id),
    ]);
    if ([positions, employees, goals, budgets, expenses, openings].some((result) => result.error)) return NextResponse.json({ error: "Department dependencies could not be checked safely. Try again or set the department inactive." }, { status: 409 });
    const references = [positions, employees, goals, budgets, expenses, openings].reduce((total, result) => total + (result.count ?? 0), 0);
    if (references > 0) return NextResponse.json({ error: "This department is used by operational records. Set it inactive to preserve history." }, { status: 409 });
    const { error } = await supabase.from("departments").delete().eq("id", id).eq("workspace_id", access.workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ deleted: true });
  }
  const { count } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("position_id", id);
  if ((count ?? 0) > 0) return NextResponse.json({ error: "This position is linked to employee history. Set it inactive instead." }, { status: 409 });
  const { error } = await supabase.from("positions").delete().eq("id", id).eq("workspace_id", access.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ deleted: true });
}
