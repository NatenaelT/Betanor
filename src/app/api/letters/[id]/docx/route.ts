import { NextResponse } from "next/server";

import { generateLetterDocx } from "@/lib/letters/docx";
import { getLetter, letterAuth } from "@/lib/letters/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, access } = await letterAuth();
  if (!access.workspaceId) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!access.permissions.has("letters.download")) return NextResponse.json({ error: "Download permission is required." }, { status: 403 });
  const { letter, error } = await getLetter(supabase, access.workspaceId, id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!letter) return NextResponse.json({ error: "Letter not found." }, { status: 404 });
  const document = generateLetterDocx(letter, access.workspace ?? { name: "Betanor" });
  const filename = `${letter.reference_number.replace(/[^A-Za-z0-9-]/g, "_")}.docx`;
  return new Response(document as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
