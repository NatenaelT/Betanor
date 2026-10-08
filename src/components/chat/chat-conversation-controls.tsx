"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { setChatConversationState } from "@/app/workspace/chats/actions";
import { useAppDialog } from "@/components/ui/app-dialog-provider";

export function ChatConversationControls({ conversationId, archived, deleted, canDelete = true, compact = false }: {
  conversationId: string;
  archived: boolean;
  deleted: boolean;
  canDelete?: boolean;
  compact?: boolean;
}) {
  const { confirm } = useAppDialog();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: "archive" | "delete" | "restore") {
    if (busy) return;
    if (action === "delete" && !await confirm({
      title: "Move conversation to trash?",
      description: "It will be removed from the active inbox. The conversation and its audit history are retained so it can be restored if needed.",
      confirmLabel: "Move to trash",
      destructive: true,
    })) return;
    setBusy(true);
    setError("");
    const result = await setChatConversationState(conversationId, action);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const buttonClass = compact
    ? "min-h-7 rounded-md px-2 text-[10px] font-semibold text-[var(--betanor-muted)] hover:bg-slate-100 hover:text-[var(--betanor-navy)] disabled:opacity-50"
    : "min-h-8 rounded-lg border border-[var(--betanor-border)] px-2.5 text-[11px] font-semibold text-[var(--betanor-navy)] hover:bg-slate-50 disabled:opacity-50";

  return <div className="flex flex-wrap items-center gap-1.5">
    {deleted ? <button type="button" disabled={busy} onClick={() => void run("restore")} className={buttonClass}>Restore</button> : <>
      <button type="button" disabled={busy} onClick={() => void run(archived ? "restore" : "archive")} className={buttonClass}>{archived ? "Restore" : "Archive"}</button>
      {canDelete ? <button type="button" disabled={busy} onClick={() => void run("delete")} className={`${buttonClass} hover:text-rose-700`}>{busy ? "Saving…" : "Delete"}</button> : null}
    </>}
    {error ? <span role="alert" className="basis-full text-[10px] text-rose-700">{error}</span> : null}
  </div>;
}
