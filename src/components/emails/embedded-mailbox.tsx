"use client";

import { Upload } from "tus-js-client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, InputHTMLAttributes } from "react";

import { createClient } from "@/lib/supabase/client";

type Folder = "INBOX" | "SENT" | "DRAFTS" | "ARCHIVE" | "TRASH";
type Attachment = { id: string; file_name: string; mime_type: string; size_bytes: number };
type Message = {
  id: string;
  sender_email: string;
  sender_name: string;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses?: string[];
  subject: string;
  body_text?: string;
  status: string;
  mail_folder: Folder;
  received_at: string | null;
  sent_at: string | null;
  created_at: string;
  is_read: boolean;
  is_starred: boolean;
  parent_message_id: string | null;
  attachments?: Attachment[];
};
type Mailbox = { id: string; email_address: string; status: string; signature_text: string; last_synced_at: string | null; last_sync_error?: string | null };
type MailSettings = { imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; maxAttachmentBytes: number };
type Account = { registeredEmail: string; mailbox: Mailbox | null; settings: MailSettings; encryptionConfigured: boolean };

const folders: Array<{ id: Folder; label: string; mark: string }> = [
  { id: "INBOX", label: "Inbox", mark: "↙" },
  { id: "SENT", label: "Sent", mark: "↗" },
  { id: "DRAFTS", label: "Drafts", mark: "▱" },
  { id: "ARCHIVE", label: "Archive", mark: "▣" },
  { id: "TRASH", label: "Trash", mark: "⌫" },
];

function dateLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-ET", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function errorText(data: unknown, fallback: string) {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : fallback;
}

function friendlyBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function addressLine(message: Message) {
  return message.mail_folder === "INBOX" || message.status === "RECEIVED"
    ? `From ${message.sender_name || message.sender_email}`
    : `To ${(message.to_addresses ?? []).join(", ") || "No recipient"}`;
}

export function EmbeddedMailbox({ canManageSettings, canReadMailbox }: { canManageSettings: boolean; canReadMailbox: boolean }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [folder, setFolder] = useState<Folder>("INBOX");
  const [messages, setMessages] = useState<Message[]>([]);
  const [page, setPage] = useState(1);
  const [totalMessages, setTotalMessages] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Message | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [mailPassword, setMailPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [compose, setCompose] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [parentMessageId, setParentMessageId] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [draftAttachments, setDraftAttachments] = useState<Attachment[]>([]);
  const [signature, setSignature] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const [mailSettings, setMailSettings] = useState<MailSettings | null>(null);

  const folderCounts = useMemo(() => ({
    INBOX: messages.filter((message) => !message.is_read).length,
  }), [messages]);

  const loadAccount = useCallback(async () => {
    const response = await fetch("/api/mailbox/connection", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorText(data, "Mailbox account could not be loaded."));
    const next = data as Account;
    setAccount(next);
    setSignature(next.mailbox?.signature_text || "");
    setMailSettings(next.settings);
    return next;
  }, []);

  const loadMessages = useCallback(async (requestedFolder: Folder = folder, requestedSearch: string = search, requestedPage = 1) => {
    const params = new URLSearchParams({ folder: requestedFolder, page: String(requestedPage), pageSize: "50" });
    if (requestedSearch.trim()) params.set("search", requestedSearch.trim());
    const response = await fetch(`/api/mailbox/messages?${params}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorText(data, "Mailbox messages could not be loaded."));
    setMessages(data.messages ?? []);
    setPage(data.page ?? requestedPage);
    setTotalMessages(data.total ?? 0);
    setTotalPages(data.totalPages ?? 1);
  }, [folder, search]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setFeedback("");
    try {
      const next = await loadAccount();
      if (next.mailbox && canReadMailbox) await loadMessages(folder, search);
      else setMessages([]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Mailbox could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [canReadMailbox, folder, loadAccount, loadMessages, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const syncInbox = useCallback(async (quiet = false) => {
    if (busy || account?.mailbox?.status !== "CONNECTED") return;
    if (!quiet) setBusy(true);
    try {
      const response = await fetch("/api/mailbox/sync", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorText(data, "Inbox sync failed."));
      if (!quiet) setFeedback(data.imported ? `${data.imported} new message${data.imported === 1 ? "" : "s"} synced.` : "Inbox is up to date.");
      await loadMessages(folder, search);
      await loadAccount();
    } catch (error) {
      if (!quiet) setFeedback(error instanceof Error ? error.message : "Inbox sync failed.");
    } finally {
      if (!quiet) setBusy(false);
    }
  }, [account?.mailbox, busy, folder, loadAccount, loadMessages, search]);

  useEffect(() => {
    if (account?.mailbox?.status !== "CONNECTED") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncInbox(true);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [account?.mailbox, syncInbox]);

  async function connectMailbox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch("/api/mailbox/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: mailPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorText(data, "Mailbox could not be connected."));
      setMailPassword("");
      await refresh();
      setFeedback("Mailbox connected. Use Sync inbox to load recent mail.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Mailbox could not be connected.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectMailbox() {
    setBusy(true);
    const response = await fetch("/api/mailbox/connection", { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) setFeedback(errorText(data, "Mailbox could not be disconnected."));
    else { setSelected(null); setDisconnectConfirm(false); setFeedback("Mailbox disconnected. Previously synced messages remain available."); await refresh(); }
  }

  function resetCompose() {
    setCompose(false); setDraftId(""); setParentMessageId("");
    setTo(""); setCc(""); setBcc(""); setSubject(""); setBody(""); setFiles([]); setDraftAttachments([]);
  }

  function startCompose(message?: Message, mode: "new" | "reply" | "replyAll" | "forward" | "edit" = "new") {
    if (!message || mode === "new") {
      setDraftId(""); setParentMessageId(""); setTo(""); setCc(""); setBcc(""); setSubject(""); setBody(""); setFiles([]); setDraftAttachments([]);
    } else if (mode === "edit") {
      setDraftId(message.id); setParentMessageId(message.parent_message_id || "");
      setDraftAttachments(message.attachments ?? []); setTo((message.to_addresses ?? []).join(", ")); setCc((message.cc_addresses ?? []).join(", "));
      setBcc((message.bcc_addresses ?? []).join(", ")); setSubject(message.subject); setBody(message.body_text || ""); setFiles([]);
    } else if (mode === "reply" || mode === "replyAll") {
      const replyTo = message.status === "RECEIVED" ? message.sender_email : (message.to_addresses?.[0] || "");
      const allCc = mode === "replyAll" ? [...(message.to_addresses ?? []).filter((address) => address.toLowerCase() !== account?.mailbox?.email_address.toLowerCase()), ...(message.cc_addresses ?? [])] : [];
      setDraftId(""); setParentMessageId(message.id); setTo(replyTo); setCc([...new Set(allCc)].join(", ")); setBcc("");
      setSubject(/^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`); setBody(""); setFiles([]); setDraftAttachments([]);
    } else {
      const quoted = `\n\n---------- Forwarded message ----------\nFrom: ${message.sender_name} <${message.sender_email}>\nSubject: ${message.subject}\n\n${message.body_text || ""}`;
      setDraftId(""); setParentMessageId(message.id); setTo(""); setCc(""); setBcc("");
      setSubject(/^fwd:/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}`); setBody(quoted); setFiles([]); setDraftAttachments([]);
    }
    setSelected(null);
    setCompose(true);
  }

  async function saveSignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFeedback("");
    const response = await fetch("/api/mailbox/connection", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signatureText: signature }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    setFeedback(response.ok ? "Signature saved and will be added to new outgoing messages." : errorText(data, "Signature could not be saved."));
    if (response.ok) await loadAccount();
  }

  async function saveMailSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!mailSettings) return;
    setBusy(true); setFeedback("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/mailbox/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imapHost: form.get("imapHost"), imapPort: Number(form.get("imapPort")), imapSecure: form.get("imapSecure") === "on",
        smtpHost: form.get("smtpHost"), smtpPort: Number(form.get("smtpPort")), smtpSecure: form.get("smtpSecure") === "on",
        maxAttachmentMb: Number(form.get("maxAttachmentMb")),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) setFeedback(errorText(data, "Mail settings could not be saved."));
    else { setFeedback("Organization mail settings saved."); await loadAccount(); }
  }

  async function uploadFiles(messageId: string, selectedFiles: File[]) {
    if (!selectedFiles.length) return;
    const attachmentLimit = Math.min(Number(account?.settings.maxAttachmentBytes || 0), 50 * 1024 * 1024);
    const alreadyAttachedBytes = draftAttachments.reduce((sum, attachment) => sum + Number(attachment.size_bytes), 0);
    const selectedBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    if (alreadyAttachedBytes + selectedBytes > attachmentLimit) {
      throw new Error(`Combined attachments exceed the ${Math.floor(attachmentLimit / (1024 * 1024))} MB per-message limit.`);
    }
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Your session expired. Sign in again before uploading.");
    const projectHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || window.location.origin);
    const storageHost = projectHost.hostname.endsWith(".supabase.co")
      ? projectHost.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co")
      : projectHost.host;
    const endpoint = `https://${storageHost}/storage/v1/upload/resumable`;
    for (const file of selectedFiles) {
      const limit = Math.min(Number(account?.settings.maxAttachmentBytes || 0), 50 * 1024 * 1024);
      if (file.size > limit) throw new Error(`${file.name} is larger than the ${Math.floor(limit / (1024 * 1024))} MB upload limit.`);
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").slice(0, 160) || "attachment";
      const storagePath = `${sessionData.session?.user.id}/${messageId}/${crypto.randomUUID()}-${safeName}`;
      await new Promise<void>((resolve, reject) => {
        const upload = new Upload(file, {
          endpoint,
          chunkSize: 6 * 1024 * 1024,
          retryDelays: [0, 1000, 3000, 5000],
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          headers: {
            authorization: `Bearer ${token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
            "x-upsert": "false",
          },
          metadata: {
            bucketName: "betanor-email-attachments",
            objectName: storagePath,
            contentType: file.type || "application/octet-stream",
            cacheControl: "3600",
          },
          onError: (error) => reject(error),
          onSuccess: () => resolve(),
        });
        upload.start();
      });
      const response = await fetch("/api/mailbox/attachments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, storagePath, fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorText(data, "File uploaded but could not be attached to this draft."));
      if (data.attachment) setDraftAttachments((current) => [...current, data.attachment as Attachment]);
    }
  }

  async function saveDraft(sendNow: boolean) {
    setBusy(true); setFeedback("");
    try {
      const payload = { to, cc, bcc, subject, body, parentMessageId: parentMessageId || null };
      const response = await fetch(draftId ? `/api/mailbox/messages/${draftId}` : "/api/mailbox/messages", {
        method: draftId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorText(data, "Draft could not be saved."));
      const id = draftId || data.id;
      if (files.length) { await uploadFiles(id, files); setFiles([]); }
      if (sendNow) {
        const sent = await fetch(`/api/mailbox/messages/${id}/send`, { method: "POST" });
        const sentData = await sent.json().catch(() => ({}));
        if (!sent.ok) throw new Error(errorText(sentData, "Message could not be sent."));
        resetCompose(); setFolder("SENT"); await loadMessages("SENT", search);
        setFeedback("Message sent from your registered mailbox.");
      } else {
        setDraftId(id); setFeedback("Draft saved."); await loadMessages("DRAFTS", search);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Message could not be saved.");
    } finally { setBusy(false); }
  }

  async function selectMessage(message: Message) {
    setCompose(false); setFeedback(""); setSelected(message);
    const response = await fetch(`/api/mailbox/messages/${message.id}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setSelected({ ...data.message, attachments: data.attachments ?? [] } as Message);
    if (!message.is_read && message.mail_folder === "INBOX") {
      void fetch(`/api/mailbox/messages/${message.id}/actions`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read" }),
      }).then(() => loadMessages(folder, search));
    }
  }

  async function messageAction(action: string) {
    if (!selected) return;
    const response = await fetch(`/api/mailbox/messages/${selected.id}/actions`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, folder }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setFeedback(errorText(data, "Message action could not be saved.")); return; }
    setSelected(null); await loadMessages(folder, search);
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSearch(searchInput); void loadMessages(folder, searchInput);
  }

  if (loading && !account) return <div className="rounded-2xl border border-[var(--betanor-border)] bg-white p-8 text-sm text-[var(--betanor-muted)]">Loading your mailbox…</div>;

  if (!account?.mailbox || !canReadMailbox) return <section className="mx-auto max-w-2xl rounded-3xl border border-[var(--betanor-border)] bg-white p-6 shadow-sm sm:p-9">
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--betanor-navy)] text-xl text-white">✉</div>
    <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-[var(--betanor-blue)]">Staff mailbox</p>
    <h1 className="mt-2 text-3xl font-semibold text-[var(--betanor-navy)]">{canReadMailbox ? "Connect your Betanor email" : "Mail-server configuration"}</h1>
    {canReadMailbox ? <><p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">The mailbox address is fixed to your authenticated account: <strong className="text-[var(--betanor-navy)]">{account?.registeredEmail || "No email on this account"}</strong>. Your mailbox password is encrypted before storage and cannot be viewed by administrators.</p>
      {!account?.encryptionConfigured ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Secure mailbox configuration is still being prepared by the system administrator.</p> : null}
      <form onSubmit={(event) => void connectMailbox(event)} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold text-[var(--betanor-navy)]">Email password<InputText value={mailPassword} onChange={setMailPassword} type={showPassword ? "text" : "password"} autoComplete="current-password" required /></label>
        <label className="flex items-center gap-2 text-sm text-[var(--betanor-text)]"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} /> Show password</label>
        <div className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-[var(--betanor-muted)]">Connection uses IMAP over TLS on {account?.settings.imapHost || "ouzo.hostns.io"}:{account?.settings.imapPort || 993} and SMTP over TLS on {account?.settings.smtpHost || "ouzo.hostns.io"}:{account?.settings.smtpPort || 465}. Ask your administrator if your mail provider gave different settings.</div>
        <button disabled={busy || !account?.registeredEmail || !account?.encryptionConfigured} className="min-h-11 w-full rounded-xl bg-[var(--betanor-navy)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--betanor-blue)] disabled:opacity-50">{busy ? "Testing and securing mailbox…" : "Connect mailbox"}</button>
      </form>
    </> : <p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">Configure the shared IMAP/SMTP connection and attachment cap. Staff credentials remain private to each mailbox owner.</p>}
    {canManageSettings ? <div className="mt-5 rounded-xl border border-[var(--betanor-border)] bg-slate-50 p-4">
      <h2 className="font-semibold text-[var(--betanor-navy)]">Organization mail-server settings</h2>
      <form onSubmit={(event) => void saveMailSettings(event)} className="mt-3 space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3"><label className="text-xs font-semibold">IMAP host<InputText name="imapHost" defaultValue={mailSettings?.imapHost} /></label><label className="text-xs font-semibold">Port<InputText name="imapPort" type="number" defaultValue={mailSettings?.imapPort} /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="imapSecure" defaultChecked={mailSettings?.imapSecure} /> IMAP TLS</label><div />
          <label className="text-xs font-semibold">SMTP host<InputText name="smtpHost" defaultValue={mailSettings?.smtpHost} /></label><label className="text-xs font-semibold">Port<InputText name="smtpPort" type="number" defaultValue={mailSettings?.smtpPort} /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="smtpSecure" defaultChecked={mailSettings?.smtpSecure} /> SMTP TLS</label><div />
          <label className="text-xs font-semibold">Max attachment size (MB)<InputText name="maxAttachmentMb" type="number" min={1} max={50} defaultValue={Math.floor((mailSettings?.maxAttachmentBytes || 50 * 1024 * 1024) / (1024 * 1024))} /></label><div className="self-end text-[10px] text-[var(--betanor-muted)]">Portal cap 50 MB</div>
        </div>
        <p className="text-[11px] leading-4 text-[var(--betanor-muted)]">The mail provider may enforce a smaller message-size limit than the portal upload cap.</p>
        <button disabled={busy} className="min-h-9 rounded-lg bg-[var(--betanor-navy)] px-4 text-sm font-semibold text-white disabled:opacity-50">Save mail settings</button>
      </form>
    </div> : null}
    <MessageFeedback text={feedback} />
  </section>;

  return <section className="overflow-hidden rounded-2xl border border-[var(--betanor-border)] bg-white shadow-[0_16px_48px_-34px_rgba(8,31,64,.5)]">
    <header className="flex flex-col gap-3 border-b border-[var(--betanor-border)] bg-[linear-gradient(115deg,rgba(12,44,82,.04),rgba(255,255,255,0)_64%)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
      <div className="flex min-w-0 items-center gap-3"><span className="hidden size-10 shrink-0 place-items-center rounded-xl bg-[var(--betanor-navy)] text-lg text-white sm:grid">✉</span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--betanor-blue)]">Betanor Mail</p><h1 className="mt-1 truncate text-lg font-semibold text-[var(--betanor-navy)] sm:text-xl">{account.mailbox.email_address}</h1><p className="mt-1 truncate text-[11px] text-[var(--betanor-muted)]">{account.mailbox.status !== "CONNECTED" ? "Mailbox disconnected" : account.mailbox.last_synced_at ? `Last synced ${dateLabel(account.mailbox.last_synced_at)}` : "Mailbox connected · sync to load your messages"}</p></div></div>
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        <button onClick={() => startCompose()} className="min-h-9 rounded-lg bg-[var(--betanor-navy)] px-3 text-xs font-semibold text-white hover:bg-[var(--betanor-blue)] sm:min-h-9">＋ Compose</button>
        <button onClick={() => void syncInbox()} disabled={busy || account.mailbox.status !== "CONNECTED"} className="min-h-9 rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-xs font-semibold text-[var(--betanor-navy)] hover:bg-slate-50 disabled:opacity-50">{busy ? "Syncing…" : "↻ Sync"}</button>
        <button onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen} className="min-h-9 rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-xs font-semibold text-[var(--betanor-navy)] hover:bg-slate-50">{settingsOpen ? "Hide settings" : "Settings"}</button>
      </div>
    </header>

    {account.mailbox.status !== "CONNECTED" ? <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:mx-6"><p className="text-sm font-semibold text-amber-950">Mailbox disconnected</p><p className="mt-1 text-xs leading-5 text-amber-900">Previously synchronized messages remain available here. Reconnect to sync and send new email.</p><form onSubmit={(event) => void connectMailbox(event)} className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-label="Registered mailbox password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={mailPassword} onChange={(event) => setMailPassword(event.target.value)} placeholder="Email password" className="min-h-10 min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 text-sm" /><button disabled={busy || !account.encryptionConfigured} className="min-h-10 rounded-lg bg-[var(--betanor-navy)] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Connecting…" : "Reconnect mailbox"}</button></form></div> : null}
    {feedback ? <MessageFeedback text={feedback} /> : null}
    {account.mailbox.last_sync_error ? <p className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:mx-6">{account.mailbox.last_sync_error}</p> : null}

    {settingsOpen ? <div className="grid gap-3 border-b border-[var(--betanor-border)] bg-slate-50 p-3 sm:p-5 lg:grid-cols-2">
      <details open className="rounded-xl border border-[var(--betanor-border)] bg-white p-4 sm:p-5">
        <summary className="cursor-pointer list-none font-semibold text-[var(--betanor-navy)] [&::-webkit-details-marker]:hidden">Email signature <span className="ml-1 text-xs font-normal text-[var(--betanor-muted)]">· Manage your sign-off</span></summary>
        <form onSubmit={(event) => void saveSignature(event)} className="mt-2">
        <p className="text-xs leading-5 text-[var(--betanor-muted)]">A plain-text signature is automatically appended to outgoing messages. It is not added to replies already containing it.</p>
        <textarea rows={5} maxLength={8000} value={signature} onChange={(event) => setSignature(event.target.value)} className="mt-3 w-full rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 py-2 text-sm" placeholder="Name\nPosition · Betanor\nPhone · website" />
        <button disabled={busy} className="mt-3 min-h-9 rounded-lg bg-[var(--betanor-navy)] px-3 text-xs font-semibold text-white disabled:opacity-50">Save signature</button>
        </form>
      </details>
      {canManageSettings ? <details className="rounded-xl border border-[var(--betanor-border)] bg-white p-4 sm:p-5">
        <summary className="cursor-pointer list-none font-semibold text-[var(--betanor-navy)] [&::-webkit-details-marker]:hidden">Organization mail-server settings <span className="ml-1 text-xs font-normal text-[var(--betanor-muted)]">· Admin</span></summary>
        <form onSubmit={(event) => void saveMailSettings(event)} className="mt-2">
        <p className="text-xs leading-5 text-[var(--betanor-muted)]">Applies to staff mailbox connections. Individual passwords are never configured here.</p>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_100px] gap-3"><label className="text-xs font-semibold">IMAP host<InputText name="imapHost" defaultValue={mailSettings?.imapHost} /></label><label className="text-xs font-semibold">Port<InputText name="imapPort" type="number" defaultValue={mailSettings?.imapPort} /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="imapSecure" defaultChecked={mailSettings?.imapSecure} /> IMAP TLS</label><div />
          <label className="text-xs font-semibold">SMTP host<InputText name="smtpHost" defaultValue={mailSettings?.smtpHost} /></label><label className="text-xs font-semibold">Port<InputText name="smtpPort" type="number" defaultValue={mailSettings?.smtpPort} /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="smtpSecure" defaultChecked={mailSettings?.smtpSecure} /> SMTP TLS</label><div />
          <label className="text-xs font-semibold">Max attachment size (MB)<InputText name="maxAttachmentMb" type="number" min={1} max={50} defaultValue={Math.floor((mailSettings?.maxAttachmentBytes || 50 * 1024 * 1024) / (1024 * 1024))} /></label><div className="self-end text-[10px] text-[var(--betanor-muted)]">Portal limit 50 MB</div>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-[var(--betanor-muted)]">Storage supports resumable uploads up to 50 MB per file. Your mail host may impose a smaller total-message cap; SMTP attachments expand during encoding.</p>
        <button disabled={busy} className="mt-3 min-h-9 rounded-lg bg-[var(--betanor-navy)] px-3 text-xs font-semibold text-white disabled:opacity-50">Save mail settings</button>
        </form>
      </details> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--betanor-border)] bg-white p-4 sm:col-span-2 sm:px-5"><div><p className="text-sm font-semibold text-[var(--betanor-navy)]">{account.mailbox.status === "CONNECTED" ? "Connected as" : "Mailbox address"} {account.mailbox.email_address}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Messages already synced remain in Betanor if you disconnect.</p></div>{disconnectConfirm ? <div className="flex items-center gap-2"><span className="text-xs text-[var(--betanor-muted)]">Remove mailbox connection?</span><button onClick={() => void disconnectMailbox()} disabled={busy} className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Yes, disconnect</button><button onClick={() => setDisconnectConfirm(false)} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold">Cancel</button></div> : account.mailbox.status === "CONNECTED" ? <button onClick={() => setDisconnectConfirm(true)} disabled={busy} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Disconnect mailbox</button> : null}</div>
    </div> : null}

    <div className="grid min-h-[min(70dvh,680px)] lg:h-[min(78dvh,860px)] lg:min-h-[620px] lg:grid-cols-[190px_minmax(280px,370px)_minmax(0,1fr)]">
      <nav aria-label="Mailbox folders" className="flex gap-1 overflow-x-auto border-b border-[var(--betanor-border)] bg-slate-50 p-2 lg:block lg:space-y-1 lg:border-b-0 lg:border-r lg:p-3">
        {folders.map((item) => <button key={item.id} onClick={() => { setFolder(item.id); setSelected(null); void loadMessages(item.id, search); }} className={`flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold transition-colors lg:w-full ${folder === item.id ? "bg-white text-[var(--betanor-navy)] shadow-sm" : "text-[var(--betanor-muted)] hover:bg-white hover:text-[var(--betanor-navy)]"}`}><span className="w-4 text-center text-sm">{item.mark}</span><span>{item.label}</span>{item.id === "INBOX" && folderCounts.INBOX ? <span className="ml-auto rounded-full bg-[var(--betanor-blue)] px-2 py-0.5 text-[10px] font-bold text-white">{folderCounts.INBOX}</span> : null}</button>)}
        <Link href="/workspace/emails" className="mt-4 hidden rounded-lg px-3 py-2 text-xs font-semibold text-[var(--betanor-blue)] hover:bg-white lg:block">Business email register →</Link>
      </nav>

      <section aria-label={`${folder.toLowerCase()} messages`} className={`${selected || compose ? "hidden lg:block" : ""} min-w-0 border-b border-[var(--betanor-border)] lg:border-b-0 lg:border-r`}>
        <form onSubmit={applySearch} className="flex gap-2 border-b border-[var(--betanor-border)] p-3">
          <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search mailbox" className="min-h-10 min-w-0 flex-1 rounded-lg border border-[var(--betanor-field-border)] px-3 text-sm" />
          <button aria-label="Search messages" className="min-w-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-[var(--betanor-navy)] hover:bg-slate-200">⌕</button>
        </form>
        {loading ? <p className="p-6 text-sm text-[var(--betanor-muted)]">Loading messages…</p> : messages.length ? <div className="max-h-[680px] overflow-y-auto">
          {messages.map((message) => <button key={message.id} onClick={() => void selectMessage(message)} className={`block w-full border-b border-[var(--betanor-border)] p-4 text-left transition-colors hover:bg-slate-50 ${selected?.id === message.id ? "bg-blue-50" : ""}`}>
            <div className="flex min-w-0 items-start gap-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${message.is_read ? "bg-transparent" : "bg-[var(--betanor-blue)]"}`} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className={`truncate text-sm ${message.is_read ? "font-medium" : "font-bold"} text-[var(--betanor-navy)]`}>{folder === "INBOX" ? message.sender_name || message.sender_email : message.to_addresses?.[0] || message.sender_email}</span><time className="shrink-0 text-[10px] text-[var(--betanor-muted)]">{dateLabel(message.received_at || message.sent_at || message.created_at)}</time></div><p className="mt-1 truncate text-sm text-[var(--betanor-text)]">{message.subject || "(No subject)"}</p><p className="mt-1 truncate text-xs text-[var(--betanor-muted)]">{(message.body_text || "").replace(/\s+/g, " ").slice(0, 110) || addressLine(message)}</p></div><span className="text-xs text-amber-500">{message.is_starred ? "★" : ""}</span></div>
            {message.attachments?.length ? <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] text-[var(--betanor-muted)]">⌁ {message.attachments.length} attachment{message.attachments.length === 1 ? "" : "s"}</span> : null}
          </button>)}
        </div> : <div className="px-5 py-14 text-center"><p className="text-sm font-semibold text-[var(--betanor-navy)]">No messages here</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Use Sync inbox to retrieve recent mail.</p></div>}
        {!loading && totalMessages > 0 ? <div className="flex items-center justify-between border-t border-[var(--betanor-border)] px-3 py-2 text-xs text-[var(--betanor-muted)]"><span>{(page - 1) * 50 + 1}–{Math.min(page * 50, totalMessages)} of {totalMessages}</span><div className="flex gap-1"><button disabled={page <= 1} onClick={() => void loadMessages(folder, search, page - 1)} className="rounded-md border border-[var(--betanor-border)] px-2 py-1 disabled:opacity-40">Previous</button><button disabled={page >= totalPages} onClick={() => void loadMessages(folder, search, page + 1)} className="rounded-md border border-[var(--betanor-border)] px-2 py-1 disabled:opacity-40">Next</button></div></div> : null}
      </section>

      <section aria-label="Message detail" className={`${selected || compose ? "" : "hidden lg:flex"} min-w-0 flex-col`}>
        {compose ? <div className="flex h-full min-w-0 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--betanor-border)] px-4 py-3"><div><p className="font-semibold text-[var(--betanor-navy)]">{draftId ? "Edit draft" : "New message"}</p><p className="text-xs text-[var(--betanor-muted)]">From {account.mailbox.email_address}</p></div><button onClick={resetCompose} className="min-h-8 rounded-lg px-2 text-xs font-semibold text-[var(--betanor-muted)] hover:bg-slate-100">Close</button></div>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="relative block pr-3 text-xs font-semibold text-[var(--betanor-muted)]">To<span aria-hidden="true" className="absolute top-0 right-0 text-[var(--betanor-danger)]">*</span><input value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-[var(--betanor-field-border)] px-3 text-sm text-[var(--betanor-text)]" placeholder="name@example.com; another@example.com" /><span className="mt-1 block text-[10px] font-normal">Required before sending; drafts can be saved without recipients.</span></label>
            <details open={Boolean(cc || bcc)} className="rounded-lg border border-[var(--betanor-border)]"><summary className="min-h-9 cursor-pointer list-none px-3 py-2 text-xs font-semibold text-[var(--betanor-blue)] [&::-webkit-details-marker]:hidden">Add Cc or Bcc</summary><div className="grid gap-3 border-t border-[var(--betanor-border)] p-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[var(--betanor-muted)]">Cc<input value={cc} onChange={(event) => setCc(event.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-[var(--betanor-field-border)] px-3 text-sm text-[var(--betanor-text)]" /></label><label className="text-xs font-semibold text-[var(--betanor-muted)]">Bcc<input value={bcc} onChange={(event) => setBcc(event.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-[var(--betanor-field-border)] px-3 text-sm text-[var(--betanor-text)]" /></label></div></details>
            <label className="block text-xs font-semibold text-[var(--betanor-muted)]">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={250} className="mt-1 min-h-10 w-full rounded-lg border border-[var(--betanor-field-border)] px-3 text-sm text-[var(--betanor-text)]" /></label>
            <label className="block text-xs font-semibold text-[var(--betanor-muted)]">Message<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={12} maxLength={100000} className="mt-1 min-h-[240px] w-full resize-y rounded-lg border border-[var(--betanor-field-border)] px-3 py-2 text-sm leading-6 text-[var(--betanor-text)]" placeholder="Write your message…" /></label>
            <div className="flex flex-wrap items-center gap-2"><label className="cursor-pointer rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold text-[var(--betanor-navy)] hover:bg-slate-50">＋ Attach files<input type="file" multiple className="sr-only" onChange={(event) => { const selectedFiles = Array.from(event.target.files ?? []); setFiles((current) => [...current, ...selectedFiles]); event.target.value = ""; }} /></label><span className="text-xs text-[var(--betanor-muted)]">Up to {Math.min(50, Math.floor(account.settings.maxAttachmentBytes / (1024 * 1024)))} MB each, within the combined message limit · resumable upload</span></div>
            {files.length ? <ul className="space-y-1">{files.map((file, index) => <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="truncate">{file.name} · {friendlyBytes(file.size)}</span><button aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))} className="ml-3 text-rose-700">Remove</button></li>)}</ul> : null}
            {draftAttachments.length ? <ul className="space-y-1">{draftAttachments.map((attachment) => <li key={attachment.id} className="text-xs text-[var(--betanor-muted)]">Attached: {attachment.file_name} · {friendlyBytes(Number(attachment.size_bytes))}</li>)}</ul> : null}
            <p className="text-xs text-[var(--betanor-muted)]">Your saved signature will be appended when sending.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--betanor-border)] p-3"><button disabled={busy} onClick={() => void saveDraft(false)} className="min-h-9 rounded-lg border border-[var(--betanor-border)] px-3 text-xs font-semibold text-[var(--betanor-navy)] disabled:opacity-50">{busy ? "Saving…" : "Save draft"}</button><button disabled={busy || account.mailbox.status !== "CONNECTED"} onClick={() => void saveDraft(true)} className="min-h-9 rounded-lg bg-[var(--betanor-navy)] px-4 text-xs font-semibold text-white hover:bg-[var(--betanor-blue)] disabled:opacity-50">{busy ? "Sending…" : "Send"}</button></div>
        </div> : selected ? <div className="flex h-full min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--betanor-border)] px-4 py-3"><button onClick={() => setSelected(null)} className="rounded-lg px-2 py-2 text-sm text-[var(--betanor-muted)] hover:bg-slate-100 lg:hidden">← Messages</button><div className="flex flex-wrap gap-1"><button onClick={() => startCompose(selected, "reply")} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold hover:bg-slate-50">Reply</button><button onClick={() => startCompose(selected, "replyAll")} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold hover:bg-slate-50">Reply all</button><button onClick={() => startCompose(selected, "forward")} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold hover:bg-slate-50">Forward</button></div><button onClick={() => void messageAction(selected.is_starred ? "unstar" : "star")} aria-label={selected.is_starred ? "Remove star" : "Star message"} className="rounded-lg px-3 py-2 text-lg text-amber-500 hover:bg-amber-50">{selected.is_starred ? "★" : "☆"}</button></div>
          <article className="min-w-0 flex-1 overflow-auto p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xl font-semibold leading-snug text-[var(--betanor-navy)]">{selected.subject || "(No subject)"}</p><p className="mt-2 text-sm font-semibold text-[var(--betanor-text)]">{selected.sender_name} <span className="font-normal text-[var(--betanor-muted)]">&lt;{selected.sender_email}&gt;</span></p><p className="mt-1 break-all text-xs text-[var(--betanor-muted)]">To: {(selected.to_addresses ?? []).join(", ") || account.mailbox.email_address}{selected.cc_addresses?.length ? ` · Cc: ${selected.cc_addresses.join(", ")}` : ""}</p></div><time className="text-xs text-[var(--betanor-muted)]">{dateLabel(selected.received_at || selected.sent_at || selected.created_at)}</time></div>
            <div className="mt-8 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--betanor-text)]">{selected.body_text || "This message has no text preview."}</div>
            {selected.attachments?.length ? <div className="mt-8 border-t border-[var(--betanor-border)] pt-4"><h2 className="text-xs font-bold uppercase tracking-wide text-[var(--betanor-muted)]">Attachments ({selected.attachments.length})</h2><ul className="mt-3 flex flex-wrap gap-2">{selected.attachments.map((attachment) => <li key={attachment.id}><a href={`/api/mailbox/attachments/${attachment.id}`} className="flex max-w-full items-center gap-2 rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs text-[var(--betanor-blue)] hover:bg-slate-50"><span className="truncate">{attachment.file_name}</span><span className="shrink-0 text-[var(--betanor-muted)]">{friendlyBytes(Number(attachment.size_bytes))}</span></a></li>)}</ul></div> : null}
          </article>
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--betanor-border)] p-3"><button onClick={() => void messageAction(selected.is_read ? "unread" : "read")} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold hover:bg-slate-50">Mark {selected.is_read ? "unread" : "read"}</button>{folder === "TRASH" || folder === "ARCHIVE" ? <button onClick={() => void messageAction("restore")} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold hover:bg-slate-50">Restore to {selected.status === "SENT" ? "sent" : "inbox"}</button> : <button onClick={() => void messageAction("archive")} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold hover:bg-slate-50">Archive</button>}<button onClick={() => void messageAction("trash")} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">Move to trash</button>{selected.status === "DRAFT" ? <button onClick={() => startCompose(selected, "edit")} className="rounded-lg bg-[var(--betanor-navy)] px-3 py-2 text-xs font-semibold text-white">Edit draft</button> : null}</div>
        </div> : <div className="hidden flex-1 flex-col items-center justify-center p-8 text-center lg:flex"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-3xl text-[var(--betanor-blue)]">✉</div><p className="mt-4 text-lg font-semibold text-[var(--betanor-navy)]">Select a message</p><p className="mt-1 max-w-sm text-sm text-[var(--betanor-muted)]">Choose a message to read, reply, forward, archive, or download its attachments.</p></div>}
      </section>
    </div>
    <div className="border-t border-[var(--betanor-border)] px-4 py-2 text-[10px] text-[var(--betanor-muted)]">{account.mailbox.status === "CONNECTED" ? "Inbox checks while this page is open every 5 minutes." : "Mailbox is disconnected; synchronized messages remain available."} Large uploads resume automatically; provider email-size limits may be lower than the portal limit.</div>
  </section>;
}

function InputText(props: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & { onChange?: (value: string) => void }) {
  const { onChange, className, ...rest } = props;
  return <input {...rest} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className={`mt-1 min-h-10 w-full rounded-lg border border-[var(--betanor-field-border)] px-3 py-2 text-sm text-[var(--betanor-text)] ${className || ""}`} />;
}

function MessageFeedback({ text }: { text: string }) {
  if (!text) return null;
  const isError = /could not|failed|error|expired|invalid|not configured|check/i.test(text);
  return <p role={isError ? "alert" : "status"} className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-sm sm:mx-6 ${isError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{text}</p>;
}
