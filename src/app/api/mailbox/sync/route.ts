import { randomUUID } from "node:crypto";
import { simpleParser } from "mailparser";
import { NextResponse } from "next/server";

import {
  createImapClient,
  getMailboxPassword,
  mailboxAuth,
  mailboxSettings,
  safeMessageHtml,
} from "@/lib/emails/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function addresses(value: { value: Array<{ address?: string }> } | undefined) {
  return (value?.value ?? []).map((item) => item.address?.trim().toLowerCase()).filter((item): item is string => Boolean(item)).slice(0, 50);
}

function safeFileName(value: string) {
  return value.replace(/[\\/\0-\x1f\x7f]/g, "_").trim().slice(0, 180) || "attachment";
}

export async function POST() {
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !authUser || !access.permissions.has("email.read")) {
    return NextResponse.json({ error: "Staff mailbox access is required." }, { status: 403 });
  }
  const { data: mailbox } = await supabase.from("email_mailboxes")
    .select("id,workspace_id,profile_id,email_address,status,sync_cursor")
    .eq("profile_id", access.userId).maybeSingle();
  if (!mailbox || mailbox.email_address.toLowerCase() !== authUser.email?.toLowerCase()) {
    return NextResponse.json({ error: "Connect the mailbox matching your registered email before syncing." }, { status: 409 });
  }
  const settings = await mailboxSettings(supabase, access.workspaceId);
  let password: string;
  try {
    password = await getMailboxPassword(supabase, mailbox.id);
  } catch {
    return NextResponse.json({ error: "Mailbox credentials could not be loaded. Reconnect your mailbox." }, { status: 503 });
  }

  const imap = createImapClient(settings, mailbox.email_address, password);
  let imported = 0;
  let importedAttachments = 0;
  let nextUid = 0;
  let uidValidity = "0";
  try {
    await imap.connect();
    const lock = await imap.getMailboxLock("INBOX", { acquireTimeout: 10_000, maxLockHoldTime: 20_000 });
    try {
      const activeMailbox = imap.mailbox;
      if (!activeMailbox) throw new Error("INBOX did not open.");
      uidValidity = activeMailbox.uidValidity?.toString() || "0";
      const previous = mailbox.sync_cursor?.INBOX as { uidValidity?: string; lastUid?: number } | undefined;
      const hasSameUidValidity = previous?.uidValidity === uidValidity;
      const previousUid = hasSameUidValidity ? Math.max(0, Number(previous?.lastUid) || 0) : 0;
      let range: string;
      let uidRange = false;
      if (previousUid > 0) {
        range = `${previousUid + 1}:*`;
        uidRange = true;
      } else {
        range = `${Math.max(1, activeMailbox.exists - 29)}:*`;
      }

      const candidateUids: number[] = [];
      const candidateFlags = new Map<number, Set<string>>();
      for await (const item of imap.fetch(range, { uid: true, flags: true }, uidRange ? { uid: true } : undefined)) {
        candidateUids.push(item.uid);
        candidateFlags.set(item.uid, item.flags ?? new Set());
        if (candidateUids.length >= 100) break;
      }
      const maxUid = candidateUids.reduce((max, value) => Math.max(max, value), previousUid);
      if (candidateUids.length) {
        const { data: existing } = await supabase.from("email_messages").select("imap_uid")
          .eq("mailbox_id", mailbox.id).eq("mail_folder", "INBOX")
          .eq("imap_uid_validity", Number(uidValidity)).in("imap_uid", candidateUids);
        const alreadyImported = new Set((existing ?? []).map((row: { imap_uid: number }) => Number(row.imap_uid)));
        const currentFlagGroups = new Map<string, number[]>();
        for (const uid of candidateUids) {
          if (!alreadyImported.has(uid)) continue;
          const flags = candidateFlags.get(uid) ?? new Set<string>();
          const groupKey = `${flags.has("\\Seen")}:${flags.has("\\Flagged")}`;
          currentFlagGroups.set(groupKey, [...(currentFlagGroups.get(groupKey) ?? []), uid]);
        }
        for (const [groupKey, uids] of currentFlagGroups) {
          const [isRead, isStarred] = groupKey.split(":").map((value) => value === "true");
          await supabase.from("email_messages").update({ is_read: isRead, is_starred: isStarred })
            .eq("mailbox_id", mailbox.id).eq("mail_folder", "INBOX")
            .eq("imap_uid_validity", Number(uidValidity)).in("imap_uid", uids);
        }
        const newUids = candidateUids.filter((uid) => !alreadyImported.has(uid)).slice(0, 2);
        if (newUids.length) {
          const fetched: Array<{ uid: number; source?: Buffer; flags?: Set<string>; internalDate?: Date | string }> = [];
          const maxSource = 72 * 1024 * 1024;
          for await (const item of imap.fetch(newUids.join(","), {
            uid: true,
            source: { maxLength: maxSource },
            flags: true,
            internalDate: true,
          }, { uid: true })) {
            fetched.push(item);
          }
          const parsedRows: Array<{ row: Record<string, unknown>; attachments: Array<{ name: string; mime: string; bytes: Buffer; cid: string | null; disposition: string }> }> = [];
          for (const item of fetched) {
            if (!item.source) continue;
            try {
              const parsed = await simpleParser(item.source);
              const from = addresses(parsed.from);
              const to = addresses(parsed.to);
              const cc = addresses(parsed.cc);
              const bcc = addresses(parsed.bcc);
              const normalizedSubject = (parsed.subject || "(No subject)").slice(0, 250);
              const text = (parsed.text || "[This email has no plain-text body.] ").slice(0, 100_000);
              const received = parsed.date || item.internalDate || new Date();
              const attachments = (parsed.attachments ?? []).map((attachment) => ({
                name: safeFileName(attachment.filename || "attachment"),
                mime: (attachment.contentType || "application/octet-stream").slice(0, 180),
                bytes: attachment.content,
                cid: attachment.contentId?.slice(0, 250) || null,
                disposition: attachment.contentDisposition === "inline" ? "inline" : "attachment",
              }));
              parsedRows.push({
                row: {
                  workspace_id: access.workspaceId,
                  mailbox_id: mailbox.id,
                  sender_profile_id: access.userId,
                  sender_email: from[0] || "unknown@unknown.invalid",
                  sender_name: parsed.from?.value?.[0]?.name?.slice(0, 180) || from[0] || "Unknown sender",
                  to_addresses: to.length ? to : [mailbox.email_address],
                  cc_addresses: cc,
                  bcc_addresses: bcc,
                  participant_profile_ids: [access.userId],
                  subject: normalizedSubject,
                  body_text: text,
                  body_html: safeMessageHtml(text),
                  status: "RECEIVED",
                  mail_folder: "INBOX",
                  rfc_message_id: parsed.messageId?.slice(0, 998) || null,
                  imap_uid: item.uid,
                  imap_uid_validity: Number(uidValidity),
                  received_at: new Date(received).toISOString(),
                  is_read: item.flags?.has("\\Seen") ?? false,
                  is_starred: item.flags?.has("\\Flagged") ?? false,
                },
                attachments,
              });
            } catch {
              // Preserve the message header when a malformed MIME payload cannot be parsed.
              parsedRows.push({
                row: {
                  workspace_id: access.workspaceId,
                  mailbox_id: mailbox.id,
                  sender_profile_id: access.userId,
                  sender_email: "unknown@unknown.invalid",
                  sender_name: "Unparsed email",
                  to_addresses: [mailbox.email_address],
                  cc_addresses: [],
                  bcc_addresses: [],
                  participant_profile_ids: [access.userId],
                  subject: "Message could not be parsed",
                  body_text: "This email could not be parsed by the portal. It remains safely stored on the mail server.",
                  body_html: safeMessageHtml("This email could not be parsed by the portal. It remains safely stored on the mail server."),
                  status: "RECEIVED",
                  mail_folder: "INBOX",
                  imap_uid: item.uid,
                  imap_uid_validity: Number(uidValidity),
                  received_at: new Date().toISOString(),
                  is_read: false,
                  is_starred: false,
                },
                attachments: [],
              });
            }
          }
          const { data: inserted, error: insertError } = await supabase.from("email_messages")
            .upsert(parsedRows.map((entry) => entry.row), {
              onConflict: "mailbox_id,imap_uid_validity,imap_uid",
              ignoreDuplicates: true,
            })
            .select("id,imap_uid");
          if (insertError) throw insertError;
          const messageIdByUid = new Map<number, string>((inserted ?? []).map((row: { id: string; imap_uid: number }) => [Number(row.imap_uid), row.id]));
          for (const entry of parsedRows) {
            const uid = Number(entry.row.imap_uid);
            const messageId = messageIdByUid.get(uid);
            if (!messageId) continue;
            imported += 1;
            let remainingBytes = Number(settings.max_attachment_bytes);
            const metadata = [];
            for (const attachment of entry.attachments) {
              if (attachment.bytes.length > remainingBytes) continue;
              remainingBytes -= attachment.bytes.length;
              const name = `${access.userId}/${messageId}/${randomUUID()}-${attachment.name}`;
              const { error: uploadError } = await supabase.storage.from("betanor-email-attachments")
                .upload(name, attachment.bytes, { contentType: attachment.mime, upsert: false });
              if (uploadError) continue;
              metadata.push({
                workspace_id: access.workspaceId,
                email_message_id: messageId,
                uploaded_by: access.userId,
                file_name: attachment.name,
                mime_type: attachment.mime,
                size_bytes: attachment.bytes.length,
                storage_path: name,
                content_id: attachment.cid,
                disposition: attachment.disposition,
              });
            }
            if (metadata.length) {
              const { error: attachmentError } = await supabase.from("email_attachments").insert(metadata);
              if (!attachmentError) importedAttachments += metadata.length;
            }
          }
          nextUid = newUids[newUids.length - 1] ?? previousUid;
        } else {
          nextUid = maxUid;
        }
      } else {
        nextUid = previousUid;
      }
      // The first sync only imports the most recent 30 messages. All subsequent
      // syncs process at most 2 new messages per request to bound server memory/time.
      const cursor = {
        ...(mailbox.sync_cursor ?? {}),
        INBOX: { uidValidity, lastUid: nextUid },
      };
      const { error: syncSaveError } = await supabase.from("email_mailboxes").update({
        sync_cursor: cursor,
        status: "CONNECTED",
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", mailbox.id).eq("profile_id", access.userId);
      if (syncSaveError) throw syncSaveError;
    } finally {
      lock.release();
    }
    return NextResponse.json({ imported, importedAttachments, nextUid, syncedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Staff mailbox IMAP sync failed", error instanceof Error ? error.name : "unknown");
    await supabase.from("email_mailboxes").update({
      status: "ERROR",
      last_sync_error: "The mail server could not be reached. Check server settings and reconnect.",
      updated_at: new Date().toISOString(),
    }).eq("id", mailbox.id).eq("profile_id", access.userId);
    return NextResponse.json({ error: "Inbox sync failed. Check your mailbox connection and mail-server settings." }, { status: 502 });
  } finally {
    if (!imap.isClosed) await imap.logout().catch(() => undefined);
  }
}
