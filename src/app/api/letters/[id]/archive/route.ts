import { NextResponse } from "next/server";

import { audit, getLetter, letterAuth } from "@/lib/letters/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { supabase, access } = await letterAuth();
  if (!access.workspaceId || !access.userId) return NextResponse.json({ error: "Authentication is required." }, { status: 401 }); if (!access.permissions.has("letters.archive")) return NextResponse.json({ error: "Archive permission is required." }, { status: 403 });
  const { letter, error: fetchError } = await getLetter(supabase, access.workspaceId, id); if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 400 }); if (!letter) return NextResponse.json({ error: "Letter not found." }, { status: 404 }); if (letter.status === "SUBMITTED") return NextResponse.json({ error: "Submitted letters are final and cannot be archived." }, { status: 409 });
  const { data, error } = await supabase.from("letters").update({ archived_at: new Date().toISOString(), archived_by: access.userId }).eq("id", id).eq("workspace_id", access.workspaceId).neq("status", "SUBMITTED").select("id,archived_at,archived_by").maybeSingle(); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); if (!data) return NextResponse.json({ error: "The letter could not be archived." }, { status: 409 }); await audit(supabase, access.workspaceId, id, "letter.archived", {}); return NextResponse.json({ archived: true });
}
