import { NextResponse } from "next/server";

import { audit, allocateReference, companyDate, createVersion, getLetter, letterAuth } from "@/lib/letters/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { supabase, access } = await letterAuth();
  if (!access.workspaceId || !access.userId) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!access.permissions.has("letters.create")) return NextResponse.json({ error: "Letter creation permission is required." }, { status: 403 });
  const { letter, error: fetchError } = await getLetter(supabase, access.workspaceId, id); if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 400 }); if (!letter) return NextResponse.json({ error: "Letter not found." }, { status: 404 });
  const body = await request.json().catch(() => ({})); const copyContent = body.copyContent !== false; const letterDate = companyDate(access.workspace?.timezone); const { reference, error: referenceError } = await allocateReference(supabase, access.workspaceId, letterDate, letter.department_id); if (referenceError || !reference) return NextResponse.json({ error: referenceError?.message || "Could not allocate a reference." }, { status: 409 });
  const { data: duplicate, error } = await supabase.from("letters").insert({ workspace_id: access.workspaceId, reference_number: reference, letter_date: letterDate, letter_type: letter.letter_type, department_id: letter.department_id, prepared_by: access.userId, recipient_name: letter.recipient_name, recipient_title: letter.recipient_title, recipient_organization: letter.recipient_organization, recipient_address: letter.recipient_address, recipient_email: letter.recipient_email, cc: letter.cc, subject: letter.subject, salutation: letter.salutation, body_html: copyContent ? letter.body_html : "<p></p>", closing: letter.closing, signatory: letter.signatory, signatory_title: letter.signatory_title, internal_notes: null, tags: letter.tags, customer_id: letter.customer_id, employee_id: letter.employee_id, tender_id: letter.tender_id, project_id: letter.project_id, contract_id: letter.contract_id, quotation_id: letter.quotation_id, rfq_id: letter.rfq_id, source_letter_id: letter.id, status: "DRAFT" }).select("*").single();
  if (error || !duplicate) return NextResponse.json({ error: error?.message || "Could not duplicate the letter." }, { status: 400 });
  await createVersion(supabase, duplicate, "CREATED", access.userId); await audit(supabase, access.workspaceId, duplicate.id, "letter.duplicated", { source_letter_id: id, reference_number: reference }); return NextResponse.json({ letter: duplicate }, { status: 201 });
}
