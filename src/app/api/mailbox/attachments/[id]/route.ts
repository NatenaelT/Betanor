import { NextResponse } from "next/server";

import { EMAIL_ATTACHMENT_BUCKET, mailboxAuth } from "@/lib/emails/mailbox";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !authUser || !access.permissions.has("email.read")) {
    return NextResponse.json({ error: "Staff mailbox access is required." }, { status: 403 });
  }
  const { data: attachment } = await supabase.from("email_attachments")
    .select("id,file_name,storage_path,email_message_id").eq("id", id).maybeSingle();
  if (!attachment) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  const { data: url, error } = await supabase.storage.from(EMAIL_ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.storage_path, 60, { download: attachment.file_name });
  if (error || !url?.signedUrl) return NextResponse.json({ error: "Attachment is not available." }, { status: 404 });
  return NextResponse.redirect(url.signedUrl, 302);
}
