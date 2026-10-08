"use client";

import { useState } from "react";

import { AiDraftPanel } from "@/components/ai/ai-draft-panel";
import { AiProofreadButton } from "@/components/ai/ai-proofread-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { useAppDialog } from "@/components/ui/app-dialog-provider";

const documentTypes = ["Business proposal", "Project plan", "Progress report", "Policy", "Procedure", "Meeting minutes", "Technical brief", "Other"];

function downloadFile(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DocumentAiDraftPanel({ companyName }: { companyName: string }) {
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState(documentTypes[0]);
  const [content, setContent] = useState("");
  const { toast } = useAppDialog();
  const getContext = () => ({
    "Document title": title.trim(),
    "Document type": documentType,
    "Company name": companyName,
    "Official motto": "Always Welcome, Always Ready.",
  });

  async function downloadWord() {
    if (!title.trim() || !content.trim()) return;
    const { generateAiDocumentDocx } = await import("@/lib/documents/docx");
    const file = generateAiDocumentDocx({ title: title.trim(), content, companyName, motto: "Always Welcome, Always Ready." });
    const buffer = new ArrayBuffer(file.byteLength);
    new Uint8Array(buffer).set(file);
    downloadFile(`${title.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "betanor-document"}.docx`, buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    toast("Word draft downloaded. Review it before sharing.");
  }

  function downloadText() {
    if (!title.trim() || !content.trim()) return;
    downloadFile(`${title.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "betanor-document"}.txt`, `${companyName}\nAlways Welcome, Always Ready.\n\n${title.trim()}\n\n${content}`, "text/plain;charset=utf-8");
    toast("Text draft downloaded. Review it before sharing.");
  }

  return <Card className="mt-8 p-5 sm:p-6">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold tracking-[0.12em] text-[var(--betanor-blue)] uppercase">AI document studio</p><h2 className="mt-2 text-xl font-semibold text-[var(--betanor-navy)]">Create a document draft</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Generate, review, edit, and download a branded Word or text draft. Nothing is auto-published.</p></div><span className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-900">Human review required</span></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><FieldLabel htmlFor="ai-document-title">Document title</FieldLabel><Input id="ai-document-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="e.g. RTSL support onboarding plan" /><AiProofreadButton contentType="document" value={title} onUse={setTitle} label="Check title" /></div>
      <div><FieldLabel htmlFor="ai-document-type">Document type</FieldLabel><select id="ai-document-type" value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="min-h-10 w-full rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 text-sm text-[var(--betanor-field-text)]">{documentTypes.map((item) => <option key={item}>{item}</option>)}</select></div>
    </div>
    <div className="mt-5"><AiDraftPanel purpose="document_draft" label="Document drafting" getContext={getContext} onUse={setContent} /></div>
    <div className="mt-5">
      <FieldLabel htmlFor="ai-document-content">Editable document content</FieldLabel>
      <textarea id="ai-document-content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={20000} rows={14} placeholder="Use an AI draft above, or write the document here…" className="mt-1.5 w-full rounded-xl border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 py-3 text-sm leading-6 text-[var(--betanor-field-text)] outline-none focus:border-[var(--betanor-field-focus)] focus:ring-2 focus:ring-blue-100" />
      <div className="mt-2"><AiProofreadButton contentType="document" value={content} onUse={setContent} /></div>
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => void downloadWord()} disabled={!title.trim() || !content.trim()}>Download Word</Button><Button type="button" size="sm" variant="outline" onClick={downloadText} disabled={!title.trim() || !content.trim()}>Download text</Button></div>
  </Card>;
}
