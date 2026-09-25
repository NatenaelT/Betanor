"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";

const modules = [
  ["letters", "Letters"],
  ["projects", "Projects"],
  ["tasks", "Tasks"],
  ["tenders", "Tenders"],
  ["quotations", "Quotations"],
  ["contracts", "Contracts"],
  ["rfqs", "RFQs"],
  ["customers", "Customers"],
  ["support_tickets", "Support tickets"],
  ["employees", "Employees"],
] as const;

type EmailLink = { module: string; recordId: string; recordLabel: string };
type Option = { id: string; module: string; label: string };

export function EmailComposeForm({
  initialTo = "",
  initialCc = "",
  initialSubject = "",
  initialBody = "",
  initialLink,
  initialLinks,
  initialMessageId,
  parentMessageId,
  deliveryConfigured,
}: {
  initialTo?: string;
  initialCc?: string;
  initialSubject?: string;
  initialBody?: string;
  initialLink?: EmailLink;
  initialLinks?: EmailLink[];
  initialMessageId?: string;
  parentMessageId?: string;
  deliveryConfigured: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [links, setLinks] = useState<EmailLink[]>(initialLinks ?? (initialLink ? [initialLink] : []));
  const [module, setModule] = useState<string>(initialLink?.module || "projects");
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [savedDraftId, setSavedDraftId] = useState("");

  async function findRecords() {
    setWorking(true);
    setFeedback("");
    try {
      const params = new URLSearchParams({ module, q: search });
      const response = await fetch(`/api/emails/related-options?${params}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not find related records.");
      setOptions(data.options ?? []);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not find related records.");
    } finally {
      setWorking(false);
    }
  }

  function addLink(option: Option) {
    if (links.some((link) => link.module === option.module && link.recordId === option.id)) return;
    setLinks((current) => [...current, { module: option.module, recordId: option.id, recordLabel: option.label }]);
    setOptions([]);
    setSearch("");
  }

  async function save(formElement: HTMLFormElement, action: "draft" | "send") {
    setWorking(true);
    setFeedback("");
    setSavedDraftId("");
    const form = new FormData(formElement);
    const response = await fetch(initialMessageId ? `/api/emails/${initialMessageId}` : "/api/emails", {
      method: initialMessageId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: form.get("to"),
        cc: form.get("cc"),
        subject: form.get("subject"),
        body: form.get("body"),
        related: links,
        parentMessageId,
        action,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setWorking(false);
    if (!response.ok) {
      if (data.id && data.status === "DRAFT") {
        setSavedDraftId(data.id);
        setFeedback(data.error || "Saved as a draft; delivery is not configured.");
      } else {
        setFeedback(data.error || "The message could not be saved.");
      }
      return;
    }
    router.push(`/workspace/emails/${data.id}`);
    router.refresh();
  }

  return <form ref={formRef} onSubmit={(event) => { event.preventDefault(); void save(event.currentTarget, "draft"); }} className="space-y-5">
    <Card className="space-y-5 p-5 sm:p-6">
      <div><FieldLabel required htmlFor="email-to">To</FieldLabel><Input id="email-to" name="to" type="text" required defaultValue={initialTo} placeholder="name@example.com; another@example.com" autoComplete="off" /><p className="mt-1 text-xs text-[var(--betanor-muted)]">Separate addresses with commas or semicolons.</p></div>
      <div><FieldLabel htmlFor="email-cc">CC</FieldLabel><Input id="email-cc" name="cc" type="text" defaultValue={initialCc} placeholder="Optional copy recipients" autoComplete="off" /></div>
      <div><FieldLabel required htmlFor="email-subject">Subject</FieldLabel><Input id="email-subject" name="subject" required maxLength={250} defaultValue={initialSubject} /></div>
      <div><FieldLabel required htmlFor="email-body">Message</FieldLabel><textarea id="email-body" name="body" required rows={12} maxLength={50000} defaultValue={initialBody} className="w-full rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 py-2 text-sm text-[var(--betanor-field-text)]" placeholder="Write your message…" /></div>
    </Card>

    <Card className="p-5 sm:p-6">
      <h2 className="font-semibold text-[var(--betanor-navy)]">Related records</h2>
      <p className="mt-1 text-sm text-[var(--betanor-muted)]">Link this correspondence to the project, task, letter, or other business item it supports.</p>
      {links.length ? <ul className="mt-3 flex flex-wrap gap-2">{links.map((link) => <li key={`${link.module}:${link.recordId}`} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs"><span>{modules.find(([value]) => value === link.module)?.[1] || "Record"}: {link.recordLabel}</span><button type="button" aria-label={`Remove ${link.recordLabel} relationship`} className="font-bold text-rose-700" onClick={() => setLinks((current) => current.filter((item) => item.recordId !== link.recordId || item.module !== link.module))}>×</button></li>)}</ul> : <p className="mt-3 text-sm text-[var(--betanor-muted)]">No related records linked.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <div><FieldLabel htmlFor="related-module">Module</FieldLabel><select id="related-module" value={module} onChange={(event) => { setModule(event.target.value); setOptions([]); }} className="min-h-10 w-full rounded-lg border border-[var(--betanor-field-border)] bg-white px-3 text-sm">{modules.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div><FieldLabel htmlFor="related-search">Find record</FieldLabel><Input id="related-search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void findRecords(); } }} placeholder="Search by name or reference" /></div>
        <Button type="button" variant="outline" className="self-end" disabled={working} onClick={() => void findRecords()}>Find</Button>
      </div>
      {options.length ? <ul className="mt-3 max-h-56 divide-y overflow-auto rounded-lg border border-[var(--betanor-border)]">{options.map((option) => <li key={option.id}><button type="button" onClick={() => addLink(option)} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">{option.label}</button></li>)}</ul> : null}
    </Card>

    {!deliveryConfigured ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">SMTP delivery is not configured on this deployment yet. You can save drafts now; Send will remain disabled until server mail settings are added.</p> : null}
    {feedback ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{feedback}{savedDraftId ? <> <a className="font-semibold underline" href={`/workspace/emails/${savedDraftId}`}>Open saved draft</a></> : null}</p> : null}
    <div className="flex flex-wrap justify-end gap-3"><Button type="submit" variant="outline" disabled={working}>{working ? "Saving…" : "Save draft"}</Button><Button type="button" disabled={working || !deliveryConfigured} onClick={() => { const form = formRef.current; if (form?.reportValidity()) void save(form, "send"); }}>{working ? "Sending…" : "Send email"}</Button></div>
  </form>;
}
