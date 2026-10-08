"use client";

import { useState } from "react";

type ContentType = "email" | "letter" | "document";

export function AiProofreadButton({
  contentType,
  value,
  onUse,
  disabled = false,
  label = "Check spelling & grammar",
}: {
  contentType: ContentType;
  value: string;
  onUse: (text: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function proofread() {
    if (busy || disabled || value.trim().length < 2 || value.length > 20000) return;
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch("/api/ai/assistant", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "proofread", contentType, proofreadText: value }),
      });
      const result = await response.json().catch(() => ({})) as { text?: unknown; error?: unknown };
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Writing assistance is unavailable right now.");
      if (typeof result.text !== "string" || !result.text.trim()) throw new Error("The review returned no text. Your draft has not been changed.");
      onUse(result.text);
      setFeedback("Suggested edits applied. Review before saving or sending.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Writing assistance is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={() => void proofread()} disabled={disabled || busy || value.trim().length < 2 || value.length > 20000} className="min-h-8 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[var(--betanor-navy)] hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">
      {busy ? "Reviewing…" : `✦ ${label}`}
    </button>
    {feedback ? <p role={feedback.startsWith("Suggested") ? "status" : "alert"} className={`text-xs leading-5 ${feedback.startsWith("Suggested") ? "text-emerald-800" : "text-rose-800"}`}>{feedback}</p> : null}
    <p className="basis-full text-[10px] leading-4 text-[var(--betanor-muted)]">Only this text is sent for a suggestion. It is not saved, sent, or published automatically. Maximum 20,000 characters.</p>
  </div>;
}
