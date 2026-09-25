import nodemailer from "nodemailer";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export async function emailAuth() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  return { supabase, access };
}

export function emailTransportConfiguration() {
  const host = process.env.BETANOR_SMTP_HOST?.trim();
  const port = Number(process.env.BETANOR_SMTP_PORT || 587);
  const user = process.env.BETANOR_SMTP_USER?.trim();
  const password = process.env.BETANOR_SMTP_PASSWORD;
  const from = process.env.BETANOR_SMTP_FROM?.trim();
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !from) return null;
  const fromName = process.env.BETANOR_SMTP_FROM_NAME?.trim() || "Betanor";
  const secure = process.env.BETANOR_SMTP_SECURE === "true" || port === 465;
  const replyTo = process.env.BETANOR_SMTP_REPLY_TO?.trim() || undefined;
  return { host, port, user, password, from, fromName, secure, replyTo };
}

export function isEmailDeliveryConfigured() {
  return emailTransportConfiguration() !== null;
}

export function escapeEmailText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function deliverPortalEmail(input: {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  replyTo: string;
}) {
  const config = emailTransportConfiguration();
  if (!config) return { configured: false as const };
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
    tls: { rejectUnauthorized: true },
  });
  const result = await transporter.sendMail({
    from: { name: config.fromName, address: config.from },
    to: input.to,
    cc: input.cc.length ? input.cc : undefined,
    replyTo: config.replyTo || input.replyTo,
    subject: input.subject,
    text: input.body,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172b4d;white-space:pre-wrap">${escapeEmailText(input.body)}</div>`,
  });
  return { configured: true as const, messageId: result.messageId };
}

export function normalizeAddresses(value: unknown) {
  const input = typeof value === "string" ? value : "";
  const addresses = input.split(/[;,\n]/).map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (addresses.length > 50) throw new Error("You can address up to 50 people per email field.");
  const invalid = addresses.find((email) => email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email));
  if (invalid) throw new Error(`“${invalid.slice(0, 80)}” is not a valid email address.`);
  return [...new Set(addresses)];
}
