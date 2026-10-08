"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";

type DraftPurpose = "letter_draft" | "document_draft";

export function AiDraftPanel({
  purpose,
  label,
  getContext,
  onUse,
}: {
  purpose: DraftPurpose;
  label: string;
  getContext?: () => Record<string, string>;
  onUse: (draft: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useAppDialog();

  useEffect(() => () => abortRef.current?.abort(), []);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (prompt.trim().length < 12 || busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");
    setDraft("");
    try {
      const response = await fetch("/api/ai/assistant", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, prompt: prompt.trim(), context: getContext?.() ?? {} }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(typeof result.error === "string" ? result.error : "The draft could not be generated.");
      }
      if (!response.body) throw new Error("The draft stream was unavailable. Please try again.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let complete = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        complete += decoder.decode(value, { stream: true });
        setDraft(complete);
      }
      complete += decoder.decode();
      setDraft(complete.trim());
      if (!complete.trim()) throw new Error("The assistant returned an empty draft. Please add more detail and try again.");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "The draft could not be generated. Please try again.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  return <section className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-amber-50/70 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold tracking-[0.12em] text-[var(--betanor-blue)] uppercase">Betanor AI · {label}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--betanor-muted)]">Give a short brief. The result streams in as an editable draft and is never published automatically.</p>
      </div>
      <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-[var(--betanor-navy)] text-sm font-bold text-white">AI</span>
    </div>
    <form onSubmit={generate} className="mt-4 space-y-3" autoComplete="off">
      <label className="grid gap-1.5 text-xs font-semibold text-[var(--betanor-navy)]">
        What should the draft say?
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} minLength={12} required rows={3} placeholder={purpose === "letter_draft" ? "Describe the purpose, key facts, requested action, and tone…" : "Describe the document’s purpose, audience, key points, and any required sections…"} className="min-h-24 w-full resize-y rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 py-2.5 text-sm font-normal leading-6 text-[var(--betanor-field-text)] outline-none transition focus:border-[var(--betanor-field-focus)] focus:ring-2 focus:ring-blue-100" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || prompt.trim().length < 12}>{busy ? "Drafting…" : draft ? "Regenerate draft" : "Generate draft"}</Button>
        {draft ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { onUse(draft); toast(`${label} draft inserted. Review it before saving or sharing.`); }}>Use this draft</Button> : null}
        {busy ? <span className="text-xs text-[var(--betanor-muted)]" role="status">Generating draft…</span> : null}
      </div>
      {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{error}</p> : null}
      {draft ? <div className="rounded-lg border border-[var(--betanor-border)] bg-white/90 p-3"><p className="mb-1 text-[10px] font-bold tracking-wide text-[var(--betanor-muted)] uppercase">Preview · draft only</p><p className="max-h-36 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-[var(--betanor-text)]">{draft}</p></div> : null}
      <p className="text-[10px] leading-4 text-[var(--betanor-muted)]">Only this brief and the visible related fields are sent to OpenAI. Do not include passwords, payment details, or unnecessary sensitive personal data.</p>
    </form>
  </section>;
}
