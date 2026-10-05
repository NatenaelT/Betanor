import { NextResponse } from "next/server";

import { createImapClient, getMailboxPassword, mailboxAuth, mailboxSettings } from "@/lib/emails/mailbox";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, access, authUser } = await mailboxAuth();
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !authUser || !access.permissions.has("email.read")) {
    return NextResponse.json({ error: "Staff mailbox access is required." }, { status: 403 });
  }
  const { data: mailbox } = await supabase.from("email_mailboxes").select("id,email_address,status")
    .eq("profile_id", access.userId).maybeSingle();
  if (!mailbox) return NextResponse.json({ error: "Mailbox is not connected." }, { status: 409 });
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const updates: Record<string, unknown> = {};
  if (action === "read") updates.is_read = true;
  else if (action === "unread") updates.is_read = false;
  else if (action === "star") updates.is_starred = true;
  else if (action === "unstar") updates.is_starred = false;
  else if (action === "archive") updates.mail_folder = "ARCHIVE";
  else if (action === "trash") updates.mail_folder = "TRASH";
  else if (action === "restore") updates.mail_folder = "INBOX";
  else return NextResponse.json({ error: "This mailbox action is not supported." }, { status: 422 });

  const { data: current, error: currentError } = await supabase.from("email_messages")
    .select("status,mail_folder,imap_uid,imap_uid_validity")
    .eq("id", id).eq("workspace_id", access.workspaceId).eq("mailbox_id", mailbox.id).maybeSingle();
  if (currentError || !current) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  if (action === "restore") {
    if (!["ARCHIVE", "TRASH"].includes(current.mail_folder)) {
      return NextResponse.json({ error: "Only archived or trashed messages can be restored." }, { status: 409 });
    }
    updates.mail_folder = current.status === "SENT" ? "SENT" : "INBOX";
  }

  if (["read", "unread", "star", "unstar"].includes(action) && current.status === "RECEIVED" && mailbox.status === "CONNECTED") {
    const uid = Number(current.imap_uid);
    if (Number.isSafeInteger(uid) && uid > 0) {
      let password: string;
      try {
        password = await getMailboxPassword(supabase, mailbox.id);
      } catch {
        return NextResponse.json({ error: "Mailbox credentials could not be loaded. Reconnect your mailbox." }, { status: 503 });
      }
      const settings = await mailboxSettings(supabase, access.workspaceId);
      const imap = createImapClient(settings, mailbox.email_address, password);
      let lock: { release: () => void } | null = null;
      try {
        await imap.connect();
        lock = await imap.getMailboxLock("INBOX", { acquireTimeout: 10_000, maxLockHoldTime: 10_000 });
        const activeMailbox = imap.mailbox;
        if (!activeMailbox || activeMailbox.uidValidity?.toString() !== String(current.imap_uid_validity)) {
          return NextResponse.json({ error: "The mail server refreshed this message. Sync the inbox and retry." }, { status: 409 });
        }
        const flag = action === "read" || action === "unread" ? "\\Seen" : "\\Flagged";
        const add = action === "read" || action === "star";
        const updated = add
          ? await imap.messageFlagsAdd(uid, [flag], { uid: true })
          : await imap.messageFlagsRemove(uid, [flag], { uid: true });
        if (!updated) return NextResponse.json({ error: "The mail server did not update this message flag." }, { status: 502 });
      } catch {
        return NextResponse.json({ error: "The mail server could not update this message. Check the connection and retry." }, { status: 502 });
      } finally {
        lock?.release();
        if (!imap.isClosed) await imap.logout().catch(() => undefined);
      }
    }
  }

  const { data, error } = await supabase.from("email_messages").update(updates)
    .eq("id", id).eq("workspace_id", access.workspaceId).eq("mailbox_id", mailbox.id)
    .select("id,mail_folder,is_read,is_starred").maybeSingle();
  if (error) return NextResponse.json({ error: error.message.includes("immutable") ? "This action is not allowed for this message." : "The mailbox update could not be saved." }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  return NextResponse.json({ message: data });
}
