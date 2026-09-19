import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  const { data: message, error } = await supabase
    .from("chat_messages")
    .select("attachment_path,attachment_name,chat_conversations(workspace_id,customer_id)")
    .eq("id", messageId)
    .maybeSingle();
  if (error || !message?.attachment_path) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  const conversation = Array.isArray(message.chat_conversations) ? message.chat_conversations[0] : message.chat_conversations;
  const canRead = Boolean(
    conversation?.workspace_id && access.permissions.has("chat.manage") && access.workspaceId === conversation.workspace_id,
  );
  if (!canRead) {
    const { data: portalAccess } = await supabase.from("customer_portal_access").select("id").eq("customer_id", conversation?.customer_id ?? "").eq("profile_id", access.userId ?? "").eq("is_active", true).maybeSingle();
    if (!portalAccess) return NextResponse.json({ error: "You do not have access to this attachment." }, { status: 403 });
  }
  const { data: signed, error: signedError } = await supabase.storage.from("betanor-chat-attachments").createSignedUrl(message.attachment_path, 300, { download: message.attachment_name || true });
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: signedError?.message || "Could not open attachment." }, { status: 400 });
  return NextResponse.redirect(signed.signedUrl);
}
