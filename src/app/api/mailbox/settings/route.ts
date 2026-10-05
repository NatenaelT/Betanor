import { NextResponse } from "next/server";

import { mailboxAuth, mailboxSettings, validMailHost } from "@/lib/emails/mailbox";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, access } = await mailboxAuth();
  if (!access.workspaceId || !access.permissions.has("email.read") && !access.permissions.has("email.manage")) {
    return NextResponse.json({ error: "Email configuration access is required." }, { status: 403 });
  }
  const settings = await mailboxSettings(supabase, access.workspaceId);
  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const { supabase, access } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.permissions.has("email.manage")) {
    return NextResponse.json({ error: "Email configuration permission is required." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const imapHost = typeof body.imapHost === "string" ? body.imapHost.trim().toLowerCase() : "";
  const smtpHost = typeof body.smtpHost === "string" ? body.smtpHost.trim().toLowerCase() : "";
  const imapPort = Number(body.imapPort);
  const smtpPort = Number(body.smtpPort);
  const maxAttachmentMb = Number(body.maxAttachmentMb);
  if (!validMailHost(imapHost) || !validMailHost(smtpHost)
    || !Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535
    || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535
    || !Number.isFinite(maxAttachmentMb) || maxAttachmentMb < 1 || maxAttachmentMb > 50) {
    return NextResponse.json({ error: "Use valid mail hosts/ports and an attachment limit between 1 and 50 MB." }, { status: 422 });
  }
  const row = {
    workspace_id: access.workspaceId,
    imap_host: imapHost,
    imap_port: imapPort,
    imap_secure: body.imapSecure !== false,
    smtp_host: smtpHost,
    smtp_port: smtpPort,
    smtp_secure: body.smtpSecure !== false,
    max_attachment_bytes: Math.floor(maxAttachmentMb * 1024 * 1024),
    updated_by: access.userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("email_mailbox_settings").upsert(row, { onConflict: "workspace_id" });
  if (error) return NextResponse.json({ error: "Email configuration could not be saved." }, { status: 400 });
  return NextResponse.json({ settings: row });
}
