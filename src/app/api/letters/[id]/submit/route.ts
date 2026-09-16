import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { audit, createVersion, getLetter, letterAuth, notify, validateLetter } from "@/lib/letters/server";
import { generateLetterPdf } from "@/lib/letters/pdf";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { supabase, access } = await letterAuth();
  if (!access.workspaceId || !access.userId) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!access.permissions.has("letters.submit")) return NextResponse.json({ error: "Submission permission is required." }, { status: 403 });
  const { letter, error: fetchError } = await getLetter(supabase, access.workspaceId, id);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 400 }); if (!letter) return NextResponse.json({ error: "Letter not found." }, { status: 404 });
  if (letter.status !== "PUBLISHED") return NextResponse.json({ error: "Only published letters can be submitted." }, { status: 409 });
  const missing = validateLetter(letter); if (missing.length) return NextResponse.json({ error: `Complete the following before submission: ${missing.join(", ")}.` }, { status: 422 });
  const pdf = generateLetterPdf(letter, access.workspace ?? { name: "Betanor" }); const pdfHash = createHash("sha256").update(pdf).digest("hex"); const path = `${access.workspaceId}/${id}/final.pdf`;
  const { error: uploadError } = await supabase.storage.from("betanor-letters").upload(path, pdf, { contentType: "application/pdf", cacheControl: "31536000", upsert: false });
  if (uploadError) {
    const status = /already exists|duplicate/i.test(uploadError.message) ? 409 : 502;
    return NextResponse.json({ error: status === 409 ? "A final PDF already exists for this letter. Refresh before retrying." : `Final PDF storage failed: ${uploadError.message}` }, { status });
  }
  const submittedAt = new Date().toISOString();
  const { data: submitted, error } = await supabase.from("letters").update({ status: "SUBMITTED", submitted_at: submittedAt, submitted_by: access.userId, final_pdf_path: path, final_pdf_hash: pdfHash }).eq("id", id).eq("workspace_id", access.workspaceId).eq("status", "PUBLISHED").select("*").maybeSingle();
  if (error) {
    await supabase.storage.from("betanor-letters").remove([path]);
    return NextResponse.json({ error: error.message }, { status: error.code === "55000" ? 409 : 400 });
  }
  if (!submitted) {
    await supabase.storage.from("betanor-letters").remove([path]);
    return NextResponse.json({ error: "The letter was submitted by another request. Refresh to view the final record." }, { status: 409 });
  }
  await createVersion(supabase, submitted, "SUBMITTED", access.userId); await audit(supabase, access.workspaceId, id, "letter.submitted", { reference_number: submitted.reference_number, final_pdf_hash: pdfHash }); await audit(supabase, access.workspaceId, id, "letter.pdf_generated", { final_pdf_hash: pdfHash, storage_path: path }); await notify(supabase, access.workspaceId, "letter.submitted", "Letter finalized", `${submitted.reference_number} is now final and immutable.`, id);
  return NextResponse.json({ letter: submitted });
}
