import { NextResponse } from "next/server";

import { generateLetterPdf } from "@/lib/letters/pdf";
import { getLetter, letterAuth } from "@/lib/letters/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { supabase, access } = await letterAuth(); if (!access.workspaceId) return NextResponse.json({ error: "Authentication is required." }, { status: 401 }); if (!access.permissions.has("letters.download")) return NextResponse.json({ error: "Download permission is required." }, { status: 403 });
  const { letter, error } = await getLetter(supabase, access.workspaceId, id); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); if (!letter) return NextResponse.json({ error: "Letter not found." }, { status: 404 });
  if (letter.status === "SUBMITTED" && letter.final_pdf_path) { const { data, error: signedError } = await supabase.storage.from("betanor-letters").createSignedUrl(letter.final_pdf_path, 600, { download: `${letter.reference_number.replace(/[^A-Za-z0-9-]/g, "_")}.pdf` }); if (signedError || !data?.signedUrl) return NextResponse.json({ error: signedError?.message || "Could not create a private PDF link." }, { status: 502 }); return NextResponse.redirect(data.signedUrl); }
  const pdf = generateLetterPdf(letter, access.workspace ?? { name: "Betanor" }); return new Response(pdf as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${letter.reference_number.replace(/[^A-Za-z0-9-]/g, "_")}.pdf"`, "Cache-Control": "private, max-age=60" } });
}
