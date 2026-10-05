import { NextResponse } from "next/server";

import { normalizeAddresses } from "@/lib/emails/server";
import {
  createSmtpTransport,
  getMailboxPassword,
  mailboxAuth,
  mailboxSettings,
  safeMessageHtml,
} from "@/lib/emails/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !authUser || !access.permissions.has("email.send")) {
    return NextResponse.json({ error: "Email send permission is required." }, { status: 403 });
  }
  const { data: mailbox } = await supabase.from("email_mailboxes")
    .select("id,email_address,signature_text").eq("profile_id", access.userId).maybeSingle();
  if (!mailbox || mailbox.email_address.toLowerCase() !== authUser.email?.toLowerCase()) {
    return NextResponse.json({ error: "Connect the mailbox matching your registered email before sending." }, { status: 409 });
  }
  const { data: message } = await supabase.from("email_messages").select("*")
    .eq("id", id).eq("workspace_id", access.workspaceId).eq("mailbox_id", mailbox.id)
    .eq("sender_profile_id", access.userId).maybeSingle();
  if (!message || message.status !== "DRAFT" || message.mail_folder !== "DRAFTS") {
    return NextResponse.json({ error: "Only your saved drafts can be sent." }, { status: 409 });
  }
  let to: string[];
  let cc: string[];
  let bcc: string[];
  try {
    to = normalizeAddresses((message.to_addresses ?? []).join(","));
    cc = normalizeAddresses((message.cc_addresses ?? []).join(","));
    bcc = normalizeAddresses((message.bcc_addresses ?? []).join(","));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Check the recipient addresses." }, { status: 422 });
  }
  if (!to.length || !message.subject?.trim() || !message.body_text?.trim()) {
    return NextResponse.json({ error: "Add a recipient, subject, and message before sending." }, { status: 422 });
  }
  const { data: attachments } = await supabase.from("email_attachments")
    .select("file_name,mime_type,size_bytes,storage_path")
    .eq("email_message_id", id);
  const settings = await mailboxSettings(supabase, access.workspaceId);
  const attachmentBytes = (attachments ?? []).reduce((sum: number, attachment: { size_bytes: number }) => sum + Number(attachment.size_bytes), 0);
  if (attachmentBytes > Number(settings.max_attachment_bytes)) {
    return NextResponse.json({ error: `Attachments exceed the administrator's ${Math.floor(Number(settings.max_attachment_bytes) / (1024 * 1024))} MB email limit.` }, { status: 413 });
  }
  const outgoingAttachments: { filename: string; contentType: string; path: string }[] = [];
  for (const attachment of attachments ?? []) {
    const { data: signed, error } = await supabase.storage.from("betanor-email-attachments")
      .createSignedUrl(attachment.storage_path, 300, { download: attachment.file_name });
    if (error || !signed?.signedUrl) return NextResponse.json({ error: `Attachment “${attachment.file_name}” is unavailable.` }, { status: 409 });
    outgoingAttachments.push({ filename: attachment.file_name, contentType: attachment.mime_type, path: signed.signedUrl });
  }

  let password: string;
  try {
    password = await getMailboxPassword(supabase, mailbox.id);
  } catch {
    return NextResponse.json({ error: "Mailbox credentials could not be loaded. Reconnect your mailbox." }, { status: 503 });
  }
  const transporter = createSmtpTransport(settings, mailbox.email_address, password);
  const signature = typeof mailbox.signature_text === "string" ? mailbox.signature_text.trim() : "";
  const bodyText = signature && !message.body_text.trimEnd().endsWith(signature)
    ? `${message.body_text.trimEnd()}\n\n${signature}`
    : message.body_text;
  let threadHeaders: { inReplyTo?: string; references?: string } = {};
  if (message.parent_message_id) {
    const { data: parent } = await supabase.from("email_messages").select("rfc_message_id,provider_message_id")
      .eq("id", message.parent_message_id).eq("mailbox_id", mailbox.id).maybeSingle();
    const parentMessageId = parent?.rfc_message_id || parent?.provider_message_id;
    if (parentMessageId) threadHeaders = { inReplyTo: parentMessageId, references: parentMessageId };
  }
  try {
    const result = await transporter.sendMail({
      from: { name: message.sender_name || mailbox.email_address, address: mailbox.email_address },
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      replyTo: mailbox.email_address,
      subject: message.subject,
      text: bodyText,
      html: safeMessageHtml(bodyText),
      ...threadHeaders,
      attachments: outgoingAttachments,
    });
    const { error: updateError } = await supabase.from("email_messages").update({
      body_text: bodyText,
      body_html: safeMessageHtml(bodyText),
      status: "SENT",
      mail_folder: "SENT",
      provider_message_id: result.messageId,
      sent_at: new Date().toISOString(),
      delivery_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "DRAFT");
    if (updateError) return NextResponse.json({ id, status: "SENT", warning: "Mail server accepted the message, but the sent folder update failed." }, { status: 202 });
    return NextResponse.json({ id, status: "SENT" });
  } catch (error) {
    console.error("Staff mailbox send failed", error instanceof Error ? error.name : "unknown");
    await supabase.from("email_messages").update({
      delivery_error: "SMTP delivery failed. Check the mailbox server configuration and retry from a new draft.",
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "DRAFT");
    return NextResponse.json({ id, status: "DRAFT", error: "The mail server could not send this message. The draft is saved and can be retried." }, { status: 502 });
  } finally {
    transporter.close();
  }
}
