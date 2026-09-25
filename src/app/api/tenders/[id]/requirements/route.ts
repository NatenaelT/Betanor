import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

const categories = new Set([
  "Technical",
  "Financial",
  "Licences & Registrations",
  "Legal",
  "Administrative",
  "Security & Guarantees",
  "Submission",
  "Other",
]);

async function getContext(tenderId: string) {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.userId || !access.permissions.has("tender.edit")) {
    return { error: NextResponse.json({ error: "Tender edit permission is required." }, { status: 403 }) };
  }
  const { data: tender, error } = await supabase
    .from("tenders")
    .select("id,status,workspace_id")
    .eq("id", tenderId)
    .eq("workspace_id", access.workspaceId)
    .maybeSingle();
  if (error || !tender) return { error: NextResponse.json({ error: "Tender not found." }, { status: 404 }) };
  if (tender.status === "SUBMITTED") {
    return { error: NextResponse.json({ error: "A submitted tender checklist is locked." }, { status: 409 }) };
  }
  return { supabase, access, tender };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getContext(id);
  if (context.error) return context.error;
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category = typeof body.category === "string" && categories.has(body.category) ? body.category : "Other";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) : null;
  if (!title || title.length > 240) return NextResponse.json({ error: "Enter a checklist title (maximum 240 characters)." }, { status: 422 });

  const { data, error } = await context.supabase!.from("tender_requirements").insert({
    tender_id: id,
    title,
    description: description || null,
    category,
    is_mandatory: body.isMandatory === true,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ requirement: data }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getContext(id);
  if (context.error) return context.error;
  const body = await request.json().catch(() => ({}));
  const requirementId = typeof body.id === "string" ? body.id : "";
  if (!requirementId) return NextResponse.json({ error: "Checklist item is required." }, { status: 422 });

  const update: Record<string, unknown> = {};
  if (typeof body.isComplete === "boolean") {
    update.is_complete = body.isComplete;
    update.completed_by = body.isComplete ? context.access!.userId : null;
    update.completed_at = body.isComplete ? new Date().toISOString() : null;
  }
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title || title.length > 240) return NextResponse.json({ error: "Enter a checklist title (maximum 240 characters)." }, { status: 422 });
    update.title = title;
  }
  if (typeof body.category === "string") {
    if (!categories.has(body.category)) return NextResponse.json({ error: "Choose a valid checklist category." }, { status: 422 });
    update.category = body.category;
  }
  if (typeof body.description === "string" || body.description === null) {
    update.description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) || null : null;
  }
  if (typeof body.isMandatory === "boolean") update.is_mandatory = body.isMandatory;
  if (!Object.keys(update).length) return NextResponse.json({ error: "No checklist changes were provided." }, { status: 422 });

  const { data, error } = await context.supabase!.from("tender_requirements")
    .update(update)
    .eq("id", requirementId)
    .eq("tender_id", id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "55000" ? 409 : 400 });
  if (!data) return NextResponse.json({ error: "Checklist item not found." }, { status: 404 });
  return NextResponse.json({ requirement: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getContext(id);
  if (context.error) return context.error;

  const { data: requirement, error: readError } = await context.supabase!.from("tender_requirements")
    .select("id,attachment_path")
    .eq("id", new URL(_request.url).searchParams.get("requirementId") || "")
    .eq("tender_id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
  if (!requirement) return NextResponse.json({ error: "Checklist item not found." }, { status: 404 });

  const { error } = await context.supabase!.from("tender_requirements")
    .delete()
    .eq("id", requirement.id)
    .eq("tender_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "55000" ? 409 : 400 });
  if (requirement.attachment_path) {
    await context.supabase!.storage.from("betanor-tender-checklists").remove([requirement.attachment_path]);
  }
  return NextResponse.json({ deleted: true });
}
