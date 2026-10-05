import { NextResponse } from "next/server";

import { mailboxAuth, mailboxSettings } from "@/lib/emails/mailbox";

export async function POST(request: Request) {
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !authUser || !access.permissions.has("email.send")) {
    return NextResponse.json({ error: "Email send permission is required." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  const fileName = typeof body.fileName === "string" ? body.fileName.trim().slice(0, 240) : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.slice(0, 180) : "application/octet-stream";
  const sizeBytes = Number(body.sizeBytes);
  const pathParts = storagePath.split("/");
  if (!messageId || !fileName || pathParts.length !== 3 || pathParts[0] !== access.userId || pathParts[1] !== messageId
    || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    return NextResponse.json({ error: "Attachment metadata is invalid." }, { status: 422 });
  }
  const { data: mailbox } = await supabase.from("email_mailboxes").select("id")
    .eq("profile_id", access.userId).maybeSingle();
  if (!mailbox) return NextResponse.json({ error: "Mailbox is not connected." }, { status: 409 });
  const settings = await mailboxSettings(supabase, access.workspaceId);
  if (sizeBytes > Math.min(Number(settings.max_attachment_bytes), EMAIL_ATTACHMENT_BUCKET_MAX_BYTES)) {
    return NextResponse.json({ error: `This file exceeds the ${Math.floor(Math.min(Number(settings.max_attachment_bytes), EMAIL_ATTACHMENT_BUCKET_MAX_BYTES) / (1024 * 1024))} MB upload limit.` }, { status: 413 });
  }
  const { data: message } = await supabase.from("email_messages").select("id,status,mail_folder")
    .eq("id", messageId).eq("mailbox_id", mailbox.id).eq("sender_profile_id", access.userId).maybeSingle();
  if (!message || message.mail_folder !== "DRAFTS" && message.status !== "RECEIVED") {
    return NextResponse.json({ error: "Attachments can only be added to a draft or a synced incoming message." }, { status: 409 });
  }
  const { data: objects, error: objectError } = await supabase.storage.from("betanor-email-attachments")
    .list(`${access.userId}/${messageId}`, { limit: 10, search: pathParts[2] });
  const uploaded = (objects ?? []).find((object) => object.name === pathParts[2]);
  const actualBytes = Number(uploaded?.metadata?.size);
  if (objectError || !uploaded || !Number.isSafeInteger(actualBytes) || actualBytes !== sizeBytes) {
    return NextResponse.json({ error: "The uploaded attachment could not be verified. Retry the upload." }, { status: 409 });
  }
  if (actualBytes > Math.min(Number(settings.max_attachment_bytes), EMAIL_ATTACHMENT_BUCKET_MAX_BYTES)) {
    return NextResponse.json({ error: "The uploaded attachment exceeds the configured mailbox limit." }, { status: 413 });
  }
  const { data, error } = await supabase.from("email_attachments").insert({
    workspace_id: access.workspaceId,
    email_message_id: messageId,
    uploaded_by: access.userId,
    file_name: fileName,
    mime_type: mimeType || "application/octet-stream",
    size_bytes: actualBytes,
    storage_path: storagePath,
    content_id: typeof body.contentId === "string" ? body.contentId.slice(0, 250) : null,
    disposition: body.disposition === "inline" ? "inline" : "attachment",
  }).select("id,email_message_id,file_name,mime_type,size_bytes").single();
  if (error || !data) return NextResponse.json({ error: "The uploaded file could not be attached to the message." }, { status: 400 });
  return NextResponse.json({ attachment: data }, { status: 201 });
}

const EMAIL_ATTACHMENT_BUCKET_MAX_BYTES = 50 * 1024 * 1024;
