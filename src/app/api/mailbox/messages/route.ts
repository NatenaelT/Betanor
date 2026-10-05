import { NextResponse } from "next/server";

import { normalizeAddresses } from "@/lib/emails/server";
import { mailboxAuth, mailboxSettings, safeMessageHtml } from "@/lib/emails/mailbox";

export const dynamic = "force-dynamic";

function parseAddresses(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [];
  return normalizeAddresses(value);
}

export async function GET(request: Request) {
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !authUser || !access.permissions.has("email.read")) {
    return NextResponse.json({ error: "Staff mailbox access is required." }, { status: 403 });
  }
  const { data: mailbox } = await supabase.from("email_mailboxes")
    .select("id").eq("profile_id", access.userId).maybeSingle();
  if (!mailbox) return NextResponse.json({ error: "Connect your registered email mailbox first." }, { status: 409 });

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") || 25) || 25));
  const folder = (url.searchParams.get("folder") || "INBOX").toUpperCase();
  if (!["INBOX", "SENT", "DRAFTS", "ARCHIVE", "TRASH"].includes(folder)) {
    return NextResponse.json({ error: "Choose a valid mailbox folder." }, { status: 422 });
  }
  const search = (url.searchParams.get("search") || "").trim().replace(/[,%()]/g, " ").slice(0, 80);
  let query = supabase.from("email_messages")
    .select("id,sender_profile_id,sender_email,sender_name,to_addresses,cc_addresses,subject,status,mail_folder,received_at,sent_at,created_at,is_read,is_starred,parent_message_id,rfc_message_id", { count: "exact" })
    .eq("workspace_id", access.workspaceId)
    .eq("mailbox_id", mailbox.id)
    .eq("mail_folder", folder)
    .order(folder === "INBOX" ? "received_at" : "created_at", { ascending: false, nullsFirst: false });
  if (search) query = query.or(`subject.ilike.%${search}%,sender_email.ilike.%${search}%,body_text.ilike.%${search}%`);
  const { data: messages, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return NextResponse.json({ error: "Mailbox messages could not be loaded." }, { status: 400 });

  const ids = (messages ?? []).map((message: { id: string }) => message.id);
  const { data: attachments } = ids.length
    ? await supabase.from("email_attachments")
      .select("id,email_message_id,file_name,mime_type,size_bytes,content_id,disposition")
      .in("email_message_id", ids)
    : { data: [] };
  const attachmentsByMessage = new Map<string, unknown[]>();
  for (const attachment of attachments ?? []) {
    attachmentsByMessage.set(attachment.email_message_id, [...(attachmentsByMessage.get(attachment.email_message_id) ?? []), attachment]);
  }
  return NextResponse.json({
    messages: (messages ?? []).map((message: { id: string }) => ({
      ...message,
      attachments: attachmentsByMessage.get(message.id) ?? [],
    })),
    page,
    pageSize,
    total: count ?? 0,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  });
}

export async function POST(request: Request) {
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !authUser || !access.permissions.has("email.send")) {
    return NextResponse.json({ error: "Email send permission is required." }, { status: 403 });
  }
  const { data: mailbox } = await supabase.from("email_mailboxes")
    .select("id,email_address").eq("profile_id", access.userId).maybeSingle();
  const senderEmail = authUser.email?.trim().toLowerCase();
  if (!mailbox || !senderEmail || mailbox.email_address.toLowerCase() !== senderEmail) {
    return NextResponse.json({ error: "Connect the mailbox matching your registered email before composing." }, { status: 409 });
  }
  const body = await request.json().catch(() => ({}));
  let toAddresses: string[];
  let ccAddresses: string[];
  let bccAddresses: string[];
  try {
    toAddresses = parseAddresses(body.to);
    ccAddresses = parseAddresses(body.cc);
    bccAddresses = parseAddresses(body.bcc);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Check the email addresses." }, { status: 422 });
  }
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 250) : "";
  const bodyText = typeof body.body === "string" ? body.body.slice(0, 100_000) : "";
  const parentMessageId = typeof body.parentMessageId === "string" ? body.parentMessageId : null;
  if (parentMessageId) {
    const { data: parent } = await supabase.from("email_messages").select("id")
      .eq("id", parentMessageId).eq("mailbox_id", mailbox.id).maybeSingle();
    if (!parent) return NextResponse.json({ error: "The reply thread is unavailable." }, { status: 404 });
  }
  const { data: profile } = await supabase.from("profiles").select("full_name")
    .eq("id", access.userId).eq("workspace_id", access.workspaceId).maybeSingle();
  const recipientList = [...new Set([...toAddresses, ...ccAddresses, ...bccAddresses])];
  const { data: recipients } = recipientList.length
    ? await supabase.from("profiles").select("id,email_address")
      .eq("workspace_id", access.workspaceId).eq("is_active", true).in("email_address", recipientList)
    : { data: [] };
  const { data: message, error } = await supabase.from("email_messages").insert({
    workspace_id: access.workspaceId,
    mailbox_id: mailbox.id,
    sender_profile_id: access.userId,
    sender_email: senderEmail,
    sender_name: profile?.full_name?.trim() || senderEmail,
    to_addresses: toAddresses,
    cc_addresses: ccAddresses,
    bcc_addresses: bccAddresses,
    participant_profile_ids: [...new Set([access.userId, ...(recipients ?? []).map((row: { id: string }) => row.id)])],
    subject,
    body_text: bodyText,
    body_html: safeMessageHtml(bodyText),
    status: "DRAFT",
    mail_folder: "DRAFTS",
    parent_message_id: parentMessageId,
  }).select("id").single();
  if (error || !message) return NextResponse.json({ error: "The draft could not be saved." }, { status: 400 });
  const settings = await mailboxSettings(supabase, access.workspaceId);
  return NextResponse.json({ id: message.id, status: "DRAFT", maxAttachmentBytes: settings.max_attachment_bytes }, { status: 201 });
}
