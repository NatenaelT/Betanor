"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { createClient } from "@/lib/supabase/client";

export type ChatMessageRecord = {
  id: string;
  body: string;
  sender_kind: string;
  sender_profile_id?: string | null;
  is_internal?: boolean;
  read_at?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  attachment_name?: string | null;
  task_id?: string | null;
  telegram_sender_label?: string | null;
  created_at: string;
};

export function ChatMessage({ message, viewerId, compact = false, onChanged }: {
  message: ChatMessageRecord;
  viewerId?: string | null;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const { confirm, prompt } = useAppDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mine = Boolean(viewerId && message.sender_profile_id === viewerId);
  const canChange = mine && !message.deleted_at && ["agent", "customer"].includes(message.sender_kind);
  const label = message.sender_kind === "telegram_group" ? message.telegram_sender_label || "Group member" : mine ? "You" : message.sender_kind === "agent" ? "Betanor staff" : message.sender_kind === "customer" ? "Customer" : message.sender_kind === "guest" ? "Guest" : "System";

  async function change(kind: "edit" | "delete") {
    if (!canChange || busy) return;
    const nextBody = kind === "edit"
      ? await prompt({ title: "Edit message", inputLabel: "Message", initialValue: message.body, submitLabel: "Save changes", validate: (value) => !value.trim() ? "A message cannot be empty." : value.length > 10000 ? "Use 10,000 characters or fewer." : null })
      : null;
    if (kind === "edit" && nextBody === null) return;
    if (kind === "delete" && !await confirm({ title: "Delete message?", description: "The message and its attachment will disappear from the conversation. This cannot be undone.", confirmLabel: "Delete message", destructive: true })) return;
    setBusy(true); setError("");
    const supabase = createClient();
    const { error: actionError } = kind === "edit"
      ? await supabase.rpc("chat_edit_message", { message_id_input: message.id, body_input: nextBody })
      : await supabase.rpc("chat_delete_message", { message_id_input: message.id });
    setBusy(false);
    if (actionError) { setError(actionError.message); return; }
    onChanged?.();
    router.refresh();
  }

  return <article className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
    <div className={`${compact ? "max-w-[88%]" : "max-w-[86%] sm:max-w-[75%]"} min-w-0 rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${mine ? "rounded-br-sm bg-[var(--betanor-navy)] text-white" : message.is_internal ? "rounded-bl-sm bg-amber-50 text-[var(--betanor-text)]" : "rounded-bl-sm bg-slate-100 text-[var(--betanor-text)]"}`}>
      <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${mine ? "text-blue-100" : "text-[var(--betanor-muted)]"}`}>{label}{message.is_internal ? " · internal" : ""}</div>
      <p className={`whitespace-pre-wrap break-words ${message.deleted_at ? "italic opacity-65" : ""}`}>{message.deleted_at ? "Message deleted" : message.body}</p>
      {!message.deleted_at && message.task_id ? <Link className={`mt-2 block text-xs font-semibold underline ${mine ? "text-blue-100" : "text-[var(--betanor-blue)]"}`} href={`/workspace/tasks/${message.task_id}`}>Open linked task</Link> : null}
      {!message.deleted_at && message.attachment_name ? <a className={`mt-2 block text-xs font-semibold underline ${mine ? "text-blue-100" : "text-[var(--betanor-blue)]"}`} href={`/api/chat/attachments/${message.id}`} target="_blank" rel="noreferrer">📎 {message.attachment_name}</a> : null}
      <div className={`mt-1.5 flex items-center justify-end gap-2 text-[10px] ${mine ? "text-blue-100" : "text-[var(--betanor-muted)]"}`}>
        <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
        {message.edited_at && !message.deleted_at ? <span>Edited</span> : null}
        {mine && !message.deleted_at ? <span>{message.read_at ? "Seen" : "Sent"}</span> : null}
      </div>
      {canChange ? <div className={`mt-1 flex justify-end gap-3 text-[11px] ${mine ? "text-blue-100" : "text-[var(--betanor-muted)]"}`}>
        <button type="button" disabled={busy} onClick={() => void change("edit")} className="underline-offset-2 hover:underline focus-visible:underline">Edit</button>
        <button type="button" disabled={busy} onClick={() => void change("delete")} className="underline-offset-2 hover:underline focus-visible:underline">Delete</button>
      </div> : null}
      {error ? <p role="alert" className="mt-2 rounded bg-rose-100 px-2 py-1 text-xs text-rose-800">{error}</p> : null}
    </div>
  </article>;
}
