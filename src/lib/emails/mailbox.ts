import "server-only";

import { createDecipheriv, createCipheriv, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const EMAIL_ATTACHMENT_BUCKET = "betanor-email-attachments";
export const MAX_EMAIL_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const defaultSettings = {
  imap_host: "ouzo.hostns.io",
  imap_port: 993,
  imap_secure: true,
  smtp_host: "ouzo.hostns.io",
  smtp_port: 465,
  smtp_secure: true,
  max_attachment_bytes: MAX_EMAIL_ATTACHMENT_BYTES,
};

export type MailboxSettings = typeof defaultSettings;
export type MailboxRecord = {
  id: string;
  workspace_id: string;
  profile_id: string;
  email_address: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  signature_text: string;
  sync_cursor: Record<string, { uidValidity: string; lastUid: number }>;
  last_synced_at: string | null;
  last_sync_error: string | null;
};

export async function mailboxAuth() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  const { data: authData } = await supabase.auth.getUser();
  return { supabase, access, authUser: authData.user };
}

export async function mailboxSettings(supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string) {
  const { data } = await supabase.from("email_mailbox_settings")
    .select("imap_host,imap_port,imap_secure,smtp_host,smtp_port,smtp_secure,max_attachment_bytes")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return { ...defaultSettings, ...(data ?? {}) } as MailboxSettings;
}

export function validMailHost(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const host = value.trim().toLowerCase();
  return host.length <= 253
    && /^[a-z0-9.-]+$/.test(host)
    && !host.startsWith(".")
    && !host.endsWith(".")
    && !host.includes("..")
    && host !== "localhost"
    && !host.endsWith(".localhost")
    && isIP(host) === 0;
}

function encryptionKey() {
  const value = process.env.MAILBOX_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error("Mailbox encryption is not configured on this deployment.");
  const key = /^[a-f0-9]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("Mailbox encryption key must contain exactly 32 bytes (base64 or 64-character hex).");
  return key;
}

export function encryptMailboxPassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMailboxPassword(value: string) {
  const [version, ivText, tagText, contentText, extra] = value.split(".");
  if (version !== "v1" || !ivText || !tagText || !contentText || extra) throw new Error("The saved mailbox credential is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(contentText, "base64url")), decipher.final()]).toString("utf8");
}

export async function getMailboxPassword(supabase: Awaited<ReturnType<typeof createClient>>, mailboxId: string) {
  const { data, error } = await supabase.rpc("email_mailbox_secret_get", { mailbox_id_input: mailboxId });
  if (error || typeof data !== "string") throw new Error("Mailbox credential is not available. Reconnect this mailbox.");
  return decryptMailboxPassword(data);
}

export function createImapClient(settings: MailboxSettings, email: string, password: string) {
  return new ImapFlow({
    host: settings.imap_host,
    port: Number(settings.imap_port),
    secure: Boolean(settings.imap_secure),
    auth: { user: email, pass: password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 25_000,
    tls: { rejectUnauthorized: true },
  });
}

export function createSmtpTransport(settings: MailboxSettings, email: string, password: string) {
  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: Number(settings.smtp_port),
    secure: Boolean(settings.smtp_secure),
    auth: { user: email, pass: password },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 30_000,
    tls: { rejectUnauthorized: true },
  });
}

export async function verifyMailboxCredentials(settings: MailboxSettings, email: string, password: string) {
  const imap = createImapClient(settings, email, password);
  const smtp = createSmtpTransport(settings, email, password);
  try {
    await imap.connect();
    const lock = await imap.getMailboxLock("INBOX");
    lock.release();
    await smtp.verify();
  } finally {
    if (!imap.isClosed) await imap.logout().catch(() => undefined);
    smtp.close();
  }
}

export function safeMessageHtml(text: string) {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  return `<div style="font-family:Arial,sans-serif;line-height:1.65;white-space:pre-wrap">${escaped}</div>`;
}

export function senderName(profileName: string | null | undefined, email: string) {
  return profileName?.trim() || email;
}
