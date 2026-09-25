import { NextResponse } from "next/server";

import { deliverPortalEmail, emailAuth, normalizeAddresses } from "@/lib/emails/server";
import { verifyEmailRelatedRecord } from "@/lib/emails/related";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, access } = await emailAuth();
  if (!access.workspaceId || !access.permissions.has("email.read") && !access.permissions.has("email.read_all")) {
    return NextResponse.json({ error: "Email read permission is required." }, { status: 403 });
  }
  const [{ data: message, error }, { data: links }] = await Promise.all([
    supabase.from("email_messages").select("*").eq("id", id).eq("workspace_id", access.workspaceId).maybeSingle(),
    supabase.from("email_message_links").select("module,record_id,record_label").eq("email_message_id", id),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Email record not found." }, { status: 404 });
  return NextResponse.json({ message, links: links ?? [] });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, access } = await emailAuth();
  if (!access.workspaceId || !access.userId || !access.permissions.has("email.send")) {
    return NextResponse.json({ error: "Email send permission is required." }, { status: 403 });
  }
  const { data: existing } = await supabase.from("email_messages").select("id,sender_email,status")
    .eq("id", id).eq("workspace_id", access.workspaceId).eq("sender_profile_id", access.userId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  if (existing.status !== "DRAFT") return NextResponse.json({ error: "Only draft emails can be edited." }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  let toAddresses: string[];
  let ccAddresses: string[];
  try {
    toAddresses = normalizeAddresses(body.to);
    ccAddresses = normalizeAddresses(body.cc);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Check the email addresses." }, { status: 422 });
  }
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 250) : "";
  const bodyText = typeof body.body === "string" ? body.body.trim().slice(0, 50_000) : "";
  if (!toAddresses.length || !subject || !bodyText) return NextResponse.json({ error: "Add a recipient, subject, and message." }, { status: 422 });

  const related = Array.isArray(body.related) ? body.related.slice(0, 10) : [];
  const verified: { module: string; recordId: string; recordLabel: string }[] = [];
  for (const item of related) {
    if (!item || typeof item.module !== "string" || !["letters", "projects", "tasks", "tenders", "quotations", "contracts", "rfqs", "customers", "support_tickets", "employees", "other"].includes(item.module) || typeof item.recordId !== "string") {
      return NextResponse.json({ error: "A linked record is invalid." }, { status: 422 });
    }
    const record = await verifyEmailRelatedRecord(supabase, item.module as Parameters<typeof verifyEmailRelatedRecord>[1], item.recordId, access.workspaceId);
    if (!record) return NextResponse.json({ error: "A linked record is unavailable or outside your access." }, { status: 404 });
    verified.push({ module: item.module, recordId: item.recordId, recordLabel: record.label });
  }
  const { data: profiles } = await supabase.from("profiles").select("id,email_address")
    .eq("workspace_id", access.workspaceId).eq("is_active", true).in("email_address", [...toAddresses, ...ccAddresses]);
  const participantIds = [...new Set([access.userId, ...(profiles ?? []).map((profile) => profile.id)])];

  const escapedBody = bodyText.split(/\r?\n/).map((line: string) => line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")).join("<br/>");
  const { error: updateError } = await supabase.from("email_messages").update({
    to_addresses: toAddresses,
    cc_addresses: ccAddresses,
    participant_profile_ids: participantIds,
    subject,
    body_text: bodyText,
    body_html: `<p>${escapedBody}</p>`,
    parent_message_id: typeof body.parentMessageId === "string" ? body.parentMessageId : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "DRAFT");
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: updateError.code === "55000" ? 409 : 400 });

  const { error: clearLinksError } = await supabase.from("email_message_links").delete().eq("email_message_id", id);
  if (clearLinksError) return NextResponse.json({ error: clearLinksError.message }, { status: 400 });
  if (verified.length) {
    const { error: linkError } = await supabase.from("email_message_links").insert(verified.map((item) => ({
      workspace_id: access.workspaceId!,
      email_message_id: id,
      module: item.module,
      record_id: item.recordId,
      record_label: item.recordLabel,
      created_by: access.userId!,
    })));
    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 400 });
  }
  if (body.action !== "send") return NextResponse.json({ id, status: "DRAFT" });

  try {
    const sent = await deliverPortalEmail({ to: toAddresses, cc: ccAddresses, subject, body: bodyText, replyTo: existing.sender_email });
    if (!sent.configured) return NextResponse.json({ id, status: "DRAFT", error: "The message is saved as a draft, but SMTP delivery is not configured for the portal yet." }, { status: 503 });
    const { error: sentUpdateError } = await supabase.from("email_messages").update({ status: "SENT", provider_message_id: sent.messageId, sent_at: new Date().toISOString() }).eq("id", id).eq("status", "DRAFT");
    if (sentUpdateError) return NextResponse.json({ id, status: "SENT", error: "Email was accepted by the mail server but its portal log could not be updated." }, { status: 202 });
    return NextResponse.json({ id, status: "SENT" });
  } catch (error) {
    await supabase.from("email_messages").update({ status: "FAILED", delivery_error: "SMTP delivery failed. Check the mail server settings and retry." }).eq("id", id).eq("status", "DRAFT");
    console.error("Betanor outbound email delivery failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ id, status: "FAILED", error: "The message could not be delivered. It remains in the email register." }, { status: 502 });
  }
}
