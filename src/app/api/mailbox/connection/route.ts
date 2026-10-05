import { NextResponse } from "next/server";

import {
  encryptMailboxPassword,
  mailboxAuth,
  mailboxSettings,
  validMailHost,
  verifyMailboxCredentials,
} from "@/lib/emails/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.hasStaffRole || !authUser || !access.permissions.has("email.read") && !access.permissions.has("email.manage")) {
    return NextResponse.json({ error: "Staff mailbox access is required." }, { status: 403 });
  }
  const [{ data: mailbox }, settings] = await Promise.all([
    supabase.from("email_mailboxes")
      .select("id,email_address,status,signature_text,last_synced_at,last_sync_error,updated_at")
      .eq("profile_id", authUser.id).maybeSingle(),
    mailboxSettings(supabase, access.workspaceId),
  ]);
  return NextResponse.json({
    registeredEmail: authUser.email?.toLowerCase() || "",
    mailbox: mailbox ?? null,
    settings: {
      imapHost: settings.imap_host,
      imapPort: settings.imap_port,
      imapSecure: settings.imap_secure,
      smtpHost: settings.smtp_host,
      smtpPort: settings.smtp_port,
      smtpSecure: settings.smtp_secure,
      maxAttachmentBytes: settings.max_attachment_bytes,
    },
    encryptionConfigured: Boolean(process.env.MAILBOX_ENCRYPTION_KEY),
  });
}

export async function POST(request: Request) {
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !authUser || !access.permissions.has("email.read")) {
    return NextResponse.json({ error: "Staff mailbox access is required." }, { status: 403 });
  }
  const registeredEmail = authUser.email?.trim().toLowerCase();
  if (!registeredEmail) return NextResponse.json({ error: "Your account has no registered email address." }, { status: 422 });
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password.length > 512) return NextResponse.json({ error: "Enter the password for your registered email mailbox." }, { status: 422 });
  if (!process.env.MAILBOX_ENCRYPTION_KEY) {
    return NextResponse.json({ error: "Secure mailbox storage is not configured yet. Contact the system administrator." }, { status: 503 });
  }
  const settings = await mailboxSettings(supabase, access.workspaceId);
  if (!validMailHost(settings.imap_host) || !validMailHost(settings.smtp_host)) {
    return NextResponse.json({ error: "The administrator has not configured a valid mail-server host." }, { status: 503 });
  }
  try {
    await verifyMailboxCredentials(settings, registeredEmail, password);
  } catch (error) {
    console.error("Staff mailbox connection verification failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "The mailbox could not connect. Check the email password and administrator mail-server settings." }, { status: 422 });
  }

  let encrypted: string;
  try {
    encrypted = encryptMailboxPassword(password);
  } catch {
    return NextResponse.json({ error: "The portal encryption key is invalid. Contact the system administrator." }, { status: 503 });
  }

  const { data: mailbox, error: mailboxError } = await supabase.from("email_mailboxes").upsert({
    workspace_id: access.workspaceId,
    profile_id: access.userId,
    email_address: registeredEmail,
    status: "CONNECTED",
    last_sync_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "profile_id" })
    .select("id,email_address,status,signature_text,last_synced_at,last_sync_error,updated_at")
    .single();
  if (mailboxError || !mailbox) return NextResponse.json({ error: "The mailbox connection could not be saved." }, { status: 400 });

  const { error: credentialError } = await supabase.rpc("email_mailbox_secret_save", {
    mailbox_id_input: mailbox.id,
    encrypted_password_input: encrypted,
  });
  if (credentialError) {
    await supabase.from("email_mailboxes").update({
      status: "ERROR",
      last_sync_error: "The password was verified but secure storage did not complete. Retry reconnecting.",
      updated_at: new Date().toISOString(),
    }).eq("id", mailbox.id).eq("profile_id", access.userId);
    return NextResponse.json({ error: "The secure mailbox credential could not be stored. Please retry." }, { status: 500 });
  }
  return NextResponse.json({ mailbox: { ...mailbox, email_address: registeredEmail }, connected: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !authUser || !access.permissions.has("email.read")) {
    return NextResponse.json({ error: "Staff mailbox access is required." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const signatureText = typeof body.signatureText === "string" ? body.signatureText.trim().slice(0, 8000) : null;
  if (signatureText === null) return NextResponse.json({ error: "Enter a signature before saving." }, { status: 422 });
  const { error } = await supabase.from("email_mailboxes")
    .update({ signature_text: signatureText, updated_at: new Date().toISOString() })
    .eq("profile_id", access.userId);
  if (error) return NextResponse.json({ error: "Your signature could not be saved." }, { status: 400 });
  return NextResponse.json({ saved: true });
}

export async function DELETE() {
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !authUser || !access.permissions.has("email.read")) {
    return NextResponse.json({ error: "Staff mailbox access is required." }, { status: 403 });
  }
  const { data: mailbox } = await supabase.from("email_mailboxes")
    .select("id").eq("profile_id", access.userId).maybeSingle();
  if (mailbox?.id) {
    const { error: secretError } = await supabase.rpc("email_mailbox_secret_delete", { mailbox_id_input: mailbox.id });
    if (secretError) return NextResponse.json({ error: "The mailbox credential could not be removed." }, { status: 500 });
    const { error } = await supabase.from("email_mailboxes").update({
      status: "DISCONNECTED",
      sync_cursor: {},
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", mailbox.id).eq("profile_id", access.userId);
    if (error) return NextResponse.json({ error: "The mailbox could not be disconnected." }, { status: 400 });
  }
  return NextResponse.json({ disconnected: true });
}
