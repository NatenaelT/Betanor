import { NextResponse } from "next/server";

import { audit, createVersion, getLetter, letterAuth, notify } from "@/lib/letters/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { supabase, access } = await letterAuth();
  if (!access.workspaceId || !access.userId) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!access.permissions.has("letters.publish")) return NextResponse.json({ error: "Publishing permission is required." }, { status: 403 });
  const { letter, error: fetchError } = await getLetter(supabase, access.workspaceId, id);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 400 }); if (!letter) return NextResponse.json({ error: "Letter not found." }, { status: 404 });
  if (letter.status !== "DRAFT") return NextResponse.json({ error: "Only draft letters can be published." }, { status: 409 });
  const { data: published, error } = await supabase.from("letters").update({ status: "PUBLISHED", published_at: new Date().toISOString(), published_by: access.userId }).eq("id", id).eq("workspace_id", access.workspaceId).eq("status", "DRAFT").select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "55000" ? 409 : 400 }); if (!published) return NextResponse.json({ error: "The letter changed before it could be published." }, { status: 409 });
  await createVersion(supabase, published, "PUBLISHED", access.userId); await audit(supabase, access.workspaceId, id, "letter.published", { reference_number: published.reference_number }); await notify(supabase, access.workspaceId, "letter.published", "Letter published", `${published.reference_number} is ready for internal review.`, id);
  return NextResponse.json({ letter: published });
}
