import { createSmtpTransport, getMailboxPassword, mailboxSettings, safeMessageHtml } from "@/lib/emails/mailbox";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export async function emailAuth() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  return { supabase, access };
}

export function isEmailDeliveryConfigured() {
  return Boolean(process.env.MAILBOX_ENCRYPTION_KEY);
}

export async function deliverPortalEmail(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  workspaceId: string;
  profileId: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  replyTo: string;
}) {
  const { data: authData } = await input.supabase.auth.getUser();
  const { data: mailbox } = await input.supabase.from("email_mailboxes")
    .select("id,email_address,signature_text").eq("profile_id", input.profileId)
    .eq("workspace_id", input.workspaceId).maybeSingle();
  if (!mailbox || !process.env.MAILBOX_ENCRYPTION_KEY
    || authData.user?.id !== input.profileId
    || mailbox.email_address.toLowerCase() !== authData.user.email?.trim().toLowerCase()) {
    return { configured: false as const };
  }
  const password = await getMailboxPassword(input.supabase, mailbox.id);
  const settings = await mailboxSettings(input.supabase, input.workspaceId);
  const transporter = createSmtpTransport(settings, mailbox.email_address, password);
  const signature = typeof mailbox.signature_text === "string" ? mailbox.signature_text.trim() : "";
  const body = signature && !input.body.trimEnd().endsWith(signature)
    ? `${input.body.trimEnd()}\n\n${signature}`
    : input.body;
  try {
    const result = await transporter.sendMail({
      from: { name: mailbox.email_address, address: mailbox.email_address },
      to: input.to,
      cc: input.cc.length ? input.cc : undefined,
      replyTo: mailbox.email_address,
      subject: input.subject,
      text: body,
      html: safeMessageHtml(body),
    });
    return { configured: true as const, messageId: result.messageId };
  } finally {
    transporter.close();
  }
}

export function normalizeAddresses(value: unknown) {
  const input = typeof value === "string" ? value : "";
  const addresses = input.split(/[;,\n]/).map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (addresses.length > 50) throw new Error("You can address up to 50 people per email field.");
  const invalid = addresses.find((email) => email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email));
  if (invalid) throw new Error(`“${invalid.slice(0, 80)}” is not a valid email address.`);
  return [...new Set(addresses)];
}
