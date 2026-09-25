import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

const maxFileSize = 15 * 1024 * 1024;
const allowedTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "text/plain",
]);

async function context(tenderId: string, requirementId: string, requireEdit = false) {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  const requiredPermission = requireEdit ? "tender.edit" : "tender.read";
  if (!access.workspaceId || !access.permissions.has(requiredPermission)) {
    return { error: NextResponse.json({ error: "Tender access is required." }, { status: 403 }) };
  }
  const { data: tender } = await supabase.from("tenders").select("id,status")
    .eq("id", tenderId).eq("workspace_id", access.workspaceId).maybeSingle();
  const { data: requirement } = await supabase.from("tender_requirements")
    .select("id,attachment_path,attachment_file_name,attachment_mime_type,attachment_size_bytes")
    .eq("id", requirementId).eq("tender_id", tenderId).maybeSingle();
  if (!tender || !requirement) return { error: NextResponse.json({ error: "Checklist item not found." }, { status: 404 }) };
  if (requireEdit && tender.status === "SUBMITTED") {
    return { error: NextResponse.json({ error: "Submitted tender checklist files are locked." }, { status: 409 }) };
  }
  return { supabase, access, tender, requirement };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  const { id, requirementId } = await params;
  const result = await context(id, requirementId);
  if (result.error) return result.error;
  if (!result.requirement!.attachment_path) return NextResponse.json({ error: "No file is attached." }, { status: 404 });
  const { data, error } = await result.supabase!.storage.from("betanor-tender-checklists")
    .createSignedUrl(result.requirement!.attachment_path, 60);
  if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || "File link could not be created." }, { status: 502 });
  return NextResponse.redirect(data.signedUrl);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  const { id, requirementId } = await params;
  const result = await context(id, requirementId, true);
  if (result.error) return result.error;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose a file to upload." }, { status: 422 });
  if (file.size > maxFileSize) return NextResponse.json({ error: "Checklist files must be 15 MB or smaller." }, { status: 413 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "Use a PDF, Office document, PNG/JPEG image, or plain-text file." }, { status: 415 });

  const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(-120) || "attachment";
  const path = `${id}/${requirementId}/${randomUUID()}-${safeName}`;
  const { error: uploadError } = await result.supabase!.storage.from("betanor-tender-checklists")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 502 });

  const { error: updateError } = await result.supabase!.from("tender_requirements")
    .update({
      attachment_path: path,
      attachment_file_name: file.name.slice(0, 200),
      attachment_mime_type: file.type,
      attachment_size_bytes: file.size,
      attachment_uploaded_at: new Date().toISOString(),
    })
    .eq("id", requirementId)
    .eq("tender_id", id);
  if (updateError) {
    await result.supabase!.storage.from("betanor-tender-checklists").remove([path]);
    return NextResponse.json({ error: updateError.message }, { status: updateError.code === "55000" ? 409 : 400 });
  }
  if (result.requirement!.attachment_path) {
    await result.supabase!.storage.from("betanor-tender-checklists").remove([result.requirement!.attachment_path]);
  }
  return NextResponse.json({ uploaded: true, fileName: file.name });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; requirementId: string }> }) {
  const { id, requirementId } = await params;
  const result = await context(id, requirementId, true);
  if (result.error) return result.error;
  if (!result.requirement!.attachment_path) return NextResponse.json({ removed: true });
  const oldPath = result.requirement!.attachment_path;
  const { error } = await result.supabase!.from("tender_requirements")
    .update({ attachment_path: null, attachment_file_name: null, attachment_mime_type: null, attachment_size_bytes: null, attachment_uploaded_at: null })
    .eq("id", requirementId)
    .eq("tender_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "55000" ? 409 : 400 });
  const removed = await result.supabase!.storage.from("betanor-tender-checklists").remove([oldPath]);
  return NextResponse.json({ removed: true, cleanupWarning: removed.error?.message });
}
