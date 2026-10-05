import { NextResponse } from "next/server";

import { normalizeAddresses } from "@/lib/emails/server";
import { mailboxAuth, safeMessageHtml } from "@/lib/emails/mailbox";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !authUser || !access.permissions.has("email.read")) {
    return NextResponse.json({ error: "Staff mailbox access is required." }, { status: 403 });
  }
  const { data: mailbox } = await supabase.from("email_mailboxes").select("id")
    .eq("profile_id", access.userId).maybeSingle();
  if (!mailbox) return NextResponse.json({ error: "Mailbox is not connected." }, { status: 409 });
  const [{ data: message, error }, { data: attachments }] = await Promise.all([
    supabase.from("email_messages").select("*").eq("id", id)
      .eq("workspace_id", access.workspaceId).eq("mailbox_id", mailbox.id).maybeSingle(),
    supabase.from("email_attachments")
      .select("id,email_message_id,file_name,mime_type,size_bytes,content_id,disposition")
      .eq("email_message_id", id),
  ]);
  if (error) return NextResponse.json({ error: "The message could not be loaded." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  return NextResponse.json({ message, attachments: attachments ?? [] });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !authUser || !access.permissions.has("email.send")) {
    return NextResponse.json({ error: "Email send permission is required." }, { status: 403 });
  }
  const { data: mailbox } = await supabase.from("email_mailboxes").select("id")
    .eq("profile_id", access.userId).maybeSingle();
  if (!mailbox) return NextResponse.json({ error: "Mailbox is not connected." }, { status: 409 });
  const { data: existing } = await supabase.from("email_messages").select("id,status")
    .eq("id", id).eq("workspace_id", access.workspaceId).eq("mailbox_id", mailbox.id)
    .eq("sender_profile_id", access.userId).maybeSingle();
  if (!existing || existing.status !== "DRAFT") return NextResponse.json({ error: "Only your saved drafts can be edited." }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  let toAddresses: string[];
  let ccAddresses: string[];
  let bccAddresses: string[];
  try {
    const parse = (input: unknown) => typeof input === "string" && input.trim() ? normalizeAddresses(input) : [];
    toAddresses = parse(body.to);
    ccAddresses = parse(body.cc);
    bccAddresses = parse(body.bcc);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Check the email addresses." }, { status: 422 });
  }
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 250) : "";
  const bodyText = typeof body.body === "string" ? body.body.slice(0, 100_000) : "";
  const parentMessageId = typeof body.parentMessageId === "string" && body.parentMessageId ? body.parentMessageId : null;
  if (parentMessageId) {
    const { data: parent } = await supabase.from("email_messages").select("id")
      .eq("id", parentMessageId).eq("mailbox_id", mailbox.id).maybeSingle();
    if (!parent) return NextResponse.json({ error: "The reply thread is unavailable." }, { status: 404 });
  }
  const recipientList = [...new Set([...toAddresses, ...ccAddresses, ...bccAddresses])];
  const { data: recipients } = recipientList.length
    ? await supabase.from("profiles").select("id,email_address")
      .eq("workspace_id", access.workspaceId).eq("is_active", true).in("email_address", recipientList)
    : { data: [] };
  const { data, error } = await supabase.from("email_messages").update({
    to_addresses: toAddresses,
    cc_addresses: ccAddresses,
    bcc_addresses: bccAddresses,
    participant_profile_ids: [...new Set([access.userId, ...(recipients ?? []).map((row: { id: string }) => row.id)])],
    subject,
    body_text: bodyText,
    body_html: safeMessageHtml(bodyText),
    parent_message_id: parentMessageId,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "DRAFT").select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "The draft could not be updated." }, { status: 400 });
  if (!data) return NextResponse.json({ error: "This draft changed while you were editing. Reload it before trying again." }, { status: 409 });
  return NextResponse.json({ id, status: "DRAFT" });
}
