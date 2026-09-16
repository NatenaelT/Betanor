import { NextResponse } from "next/server";

import { letterAuth } from "@/lib/letters/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { id, attachmentId } = await params; const { supabase, access } = await letterAuth(); if (!access.workspaceId || !access.permissions.has("letters.download")) return NextResponse.json({ error: "Download permission is required." }, { status: 403 }); const { data: letter } = await supabase.from("letters").select("id,workspace_id").eq("id", id).eq("workspace_id", access.workspaceId).maybeSingle(); if (!letter) return NextResponse.json({ error: "Letter not found." }, { status: 404 }); const { data: attachment } = await supabase.from("letter_attachments").select("storage_path,file_name").eq("id", attachmentId).eq("letter_id", id).is("deleted_at", null).maybeSingle(); if (!attachment) return NextResponse.json({ error: "Attachment not found." }, { status: 404 }); const { data, error } = await supabase.storage.from("betanor-letters").createSignedUrl(attachment.storage_path, 600, { download: attachment.file_name }); if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || "Could not create a private attachment link." }, { status: 502 }); return NextResponse.redirect(data.signedUrl);
}
