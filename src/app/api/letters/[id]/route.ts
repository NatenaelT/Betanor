import { NextResponse } from "next/server";

import { audit, createVersion, getLetter, hasAnyPermission, letterAuth, normalizeDraft } from "@/lib/letters/server";
import { LETTER_COLUMNS } from "@/lib/letters/types";
import type { LetterRecord } from "@/lib/letters/types";

export const dynamic = "force-dynamic";
function error(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { supabase, access } = await letterAuth();
  if (!access.workspaceId || !hasAnyPermission(access, ["letters.read", "letters.view_department", "letters.view_all"])) return error("Letter access is required.", 403);
  const { letter, error: fetchError } = await getLetter(supabase, access.workspaceId, id);
  if (fetchError) return error(fetchError.message);
  if (!letter) return error("Letter not found or not visible to your role.", 404);
  const [{ data: versions }, { data: attachments }, { data: department }, { data: preparedBy }, { data: approvedBy }] = await Promise.all([
    supabase.from("letter_versions").select("id,version_number,version_type,content_hash,created_by,created_at").eq("letter_id", id).order("version_number", { ascending: false }),
    supabase.from("letter_attachments").select("id,file_name,mime_type,size_bytes,storage_path,checksum,uploaded_by,created_at,deleted_at").eq("letter_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    letter.department_id ? supabase.from("departments").select("id,name,code").eq("id", letter.department_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("profiles").select("id,full_name,job_title").eq("id", letter.prepared_by).maybeSingle(),
    letter.approved_by ? supabase.from("profiles").select("id,full_name,job_title").eq("id", letter.approved_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return NextResponse.json({ letter, versions: versions ?? [], attachments: attachments ?? [], department, preparedBy, approvedBy });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { supabase, access } = await letterAuth();
  if (!access.workspaceId || !access.userId) return error("Authentication is required.", 401);
  const { letter, error: fetchError } = await getLetter(supabase, access.workspaceId, id);
  if (fetchError) return error(fetchError.message); if (!letter) return error("Letter not found.", 404); if (letter.status === "SUBMITTED") return error("Submitted letters are immutable and cannot be edited.", 409);
  const canEdit = access.permissions.has("letters.edit_all") || (access.permissions.has("letters.edit_own") && letter.prepared_by === access.userId);
  if (!canEdit) return error("You do not have permission to edit this letter.", 403);
  const draft = normalizeDraft(await request.json().catch(() => ({})));
  if (draft.recipient_name.length < 2 || draft.recipient_organization.length < 2 || draft.subject.length < 2 || draft.signatory.length < 2 || draft.body_html.replace(/<[^>]+>/g, "").trim().length < 2) return error("Recipient, organization, subject, body, and signatory are required.", 422);
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.letter_date || "") ? draft.letter_date as string : letter.letter_date;
  const letterDate = access.permissions.has("letters.edit_all") ? requestedDate : letter.letter_date;
  const { data: updated, error: updateError } = await supabase.from("letters").update({ ...draft, letter_date: letterDate }).eq("id", id).eq("workspace_id", access.workspaceId).neq("status", "SUBMITTED").select(LETTER_COLUMNS).maybeSingle();
  if (updateError) return error(updateError.message, updateError.code === "55000" ? 409 : 400); if (!updated) return error("The letter could not be updated.", 409);
  await createVersion(supabase, updated as unknown as LetterRecord, "EDITED", access.userId); await audit(supabase, access.workspaceId, id, "letter.edited", { status: (updated as unknown as LetterRecord).status });
  return NextResponse.json({ letter: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, access } = await letterAuth();
  if (!access.workspaceId || !access.userId) return error("Authentication is required.", 401);
  if (!access.permissions.has("letters.delete")) return error("Draft deletion permission is required.", 403);

  const { letter, error: fetchError } = await getLetter(supabase, access.workspaceId, id);
  if (fetchError) return error(fetchError.message);
  if (!letter) return error("Letter not found.", 404);
  if (letter.status !== "DRAFT") return error("Only draft letters can be deleted.", 409);

  const { data: attachments, error: attachmentError } = await supabase
    .from("letter_attachments")
    .select("storage_path")
    .eq("letter_id", id)
    .is("deleted_at", null);
  if (attachmentError) return error(attachmentError.message);

  const storagePaths = (attachments ?? []).map((attachment) => attachment.storage_path).filter(Boolean);
  if (storagePaths.length) {
    const { error: storageError } = await supabase.storage.from("betanor-letters").remove(storagePaths);
    if (storageError) return error(storageError.message, 502);
  }

  await audit(supabase, access.workspaceId, id, "letter.deleted", { reference_number: letter.reference_number });
  const { data: deleted, error: deleteError } = await supabase
    .from("letters")
    .delete()
    .eq("id", id)
    .eq("workspace_id", access.workspaceId)
    .eq("status", "DRAFT")
    .select("id")
    .maybeSingle();
  if (deleteError) return error(deleteError.message, deleteError.code === "42501" ? 403 : 400);
  if (!deleted) return error("The draft could not be deleted.", 409);
  return NextResponse.json({ deleted: true, id });
}
