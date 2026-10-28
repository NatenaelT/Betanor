"use client";

import { useState, useTransition } from "react";
import { createApplicantDocumentPreviewLink } from "@/app/workspace/recruitment/actions";

export function ApplicantDocumentViewer({
  label,
  applicationId,
  path,
}: {
  label: string;
  applicationId: string;
  path: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  if (!path) return <span className="text-xs text-[var(--betanor-muted)]">{label} unavailable</span>;
  const documentPath = path;
  const extension = documentPath.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = extension === "pdf";
  const fileName = path.split("/").pop() ?? label;

  function requestPreview() {
    setError("");
    startTransition(async () => {
      const result = await createApplicantDocumentPreviewLink(applicationId, documentPath);
      if (!result.signedUrl) {
        setError(result.error || "The file could not be opened.");
        return;
      }
      setSignedUrl(result.signedUrl);
      setOpen(true);
    });
  }

  return <>
    <button type="button" disabled={isPending} onClick={requestPreview} className="rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-left text-xs font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-gold)] hover:bg-amber-50/40 disabled:cursor-wait disabled:opacity-60">
      {isPending ? "Opening…" : `Preview ${label}`}
    </button>
    {error ? <span role="alert" className="basis-full text-xs text-[var(--betanor-danger)]">{error}</span> : null}
    {open ? <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-2 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label={`${label} preview`} className="flex h-[min(92dvh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[var(--betanor-border)] bg-white shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--betanor-border)] px-4 py-3 sm:px-5">
          <div className="min-w-0"><p className="text-sm font-semibold text-[var(--betanor-navy)]">{label} preview</p><p className="truncate text-xs text-[var(--betanor-muted)]">{fileName}</p></div>
          <div className="flex items-center gap-2"><a href={signedUrl} download className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-gold)]">Download</a><button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-[var(--betanor-navy)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--betanor-blue)]">Close</button></div>
        </header>
        <div className="min-h-0 flex-1 bg-slate-100">
          {isPdf ? <iframe src={signedUrl} title={`${label} PDF`} referrerPolicy="no-referrer" className="h-full w-full border-0 bg-white" /> : <div className="flex h-full items-center justify-center p-6"><div className="max-w-lg rounded-xl border border-[var(--betanor-border)] bg-white p-5 text-center shadow-sm"><p className="font-semibold text-[var(--betanor-navy)]">In-app preview is available for PDF files.</p><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">This private {extension.toUpperCase() || "document"} remains protected. Download it securely to review in a compatible document viewer; it is not sent to an external preview service.</p><a href={signedUrl} download className="mt-4 inline-flex rounded-lg bg-[var(--betanor-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--betanor-blue)]">Download {label.toLowerCase()}</a></div></div>}
        </div>
      </section>
    </div> : null}
  </>;
}
