"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";

type Tender = {
  id: string;
  reference_number: string;
  title: string;
  procuring_organization?: string | null;
  status: string;
  submission_deadline?: string | null;
  estimated_value?: number | null;
  currency_code?: string | null;
};

function statusTone(status: string) {
  if (["SUBMITTED", "AWARDED"].includes(status)) return "success" as const;
  if (["READY_FOR_SUBMISSION", "GO_NO_GO"].includes(status)) return "warning" as const;
  if (["LOST", "CANCELLED"].includes(status)) return "danger" as const;
  return "info" as const;
}

export function TenderManagementPanel({
  tenders,
  canCreate,
  canEdit,
}: {
  tenders: Tender[];
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredTenders = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tenders.filter((tender) => {
      const matchesTerm = !term || [tender.title, tender.reference_number, tender.procuring_organization]
        .some((value) => value?.toLowerCase().includes(term));
      return matchesTerm && (statusFilter === "all" || tender.status === statusFilter);
    });
  }, [query, statusFilter, tenders]);

  async function create(form: HTMLFormElement) {
    setSaving(true);
    setMessage("");
    const body = Object.fromEntries(new FormData(form).entries());
    const response = await fetch("/api/tenders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: body.title,
        referenceNumber: body.referenceNumber,
        procuringOrganization: body.procuringOrganization,
        tenderType: body.tenderType,
        estimatedValue: body.estimatedValue,
        submissionDeadline: body.submissionDeadline,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(data.error || "Could not create tender.");
      return;
    }
    router.push(`/workspace/tenders/${data.tender.id}`);
  }

  const statuses = [...new Set(tenders.map((tender) => tender.status))].sort();

  return <>
    <section className="mt-8 grid gap-3 sm:grid-cols-3">
      {[
        ["Open pipeline", tenders.filter((tender) => !["SUBMITTED", "AWARDED", "LOST", "CANCELLED"].includes(tender.status)).length],
        ["Deadlines set", tenders.filter((tender) => Boolean(tender.submission_deadline)).length],
        ["Submitted / awarded", tenders.filter((tender) => ["SUBMITTED", "AWARDED"].includes(tender.status)).length],
      ].map(([label, count]) => <Card key={String(label)} className="p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--betanor-muted)]">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--betanor-navy)]">{count}</p>
      </Card>)}
    </section>

    {canCreate ? <Card className="mt-6 overflow-hidden">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50 sm:px-6">
        <span><span className="block font-semibold text-[var(--betanor-navy)]">Create a tender</span><span className="mt-1 block text-sm text-[var(--betanor-muted)]">Start a controlled tender workspace for requirements, proposal work, guarantees, and submission.</span></span>
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--betanor-border)] text-lg text-[var(--betanor-navy)]">{open ? "−" : "+"}</span>
      </button>
      {open ? <form className="grid gap-4 border-t border-[var(--betanor-border)] bg-slate-50/70 p-5 sm:grid-cols-2 sm:p-6" onSubmit={(event) => { event.preventDefault(); void create(event.currentTarget); }}>
        <div><FieldLabel required htmlFor="tender-title">Tender title</FieldLabel><Input id="tender-title" name="title" required maxLength={300} /></div>
        <div><FieldLabel htmlFor="tender-reference">Reference number</FieldLabel><Input id="tender-reference" name="referenceNumber" placeholder="BTNR-TND-2026-00001" /></div>
        <div><FieldLabel htmlFor="tender-org">Procuring organization</FieldLabel><Input id="tender-org" name="procuringOrganization" /></div>
        <div><FieldLabel htmlFor="tender-type">Tender type</FieldLabel><Input id="tender-type" name="tenderType" placeholder="Open tender, RFQ, framework…" /></div>
        <div><FieldLabel htmlFor="tender-value">Estimated value (ETB)</FieldLabel><Input id="tender-value" name="estimatedValue" type="number" min="0" step="0.01" /></div>
        <div><FieldLabel htmlFor="tender-deadline">Submission deadline</FieldLabel><Input id="tender-deadline" name="submissionDeadline" type="datetime-local" /></div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create tender"}</Button>{message ? <span className="text-sm text-[var(--betanor-danger)]" role="alert">{message}</span> : null}</div>
      </form> : null}
    </Card> : null}

    <Card className="mt-6 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-[var(--betanor-border)] bg-white px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div><h2 className="font-semibold text-[var(--betanor-navy)]">Tender pipeline</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">{filteredTenders.length} of {tenders.length} visible tenders · access is scoped to your permissions.</p></div>
        <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_12rem]">
          <Input aria-label="Search tenders" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, title, organization" />
          <select aria-label="Filter tenders by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm text-[var(--betanor-navy)]"><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>
        </div>
      </div>
      {filteredTenders.length ? <div className="divide-y divide-[var(--betanor-border)]">{filteredTenders.map((tender) => <article key={tender.id} className="grid gap-4 px-5 py-4 transition hover:bg-blue-50/20 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone(tender.status)}>{tender.status.replaceAll("_", " ")}</Badge><span className="text-xs text-[var(--betanor-muted)]">{tender.reference_number}</span></div><Link href={`/workspace/tenders/${tender.id}`} className="mt-2 block truncate font-semibold text-[var(--betanor-navy)] hover:text-[var(--betanor-blue)]">{tender.title}</Link><p className="mt-1 text-xs text-[var(--betanor-muted)]">{tender.procuring_organization || "Organization not recorded"}</p></div>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end"><div className="text-left text-xs text-[var(--betanor-muted)] sm:text-right"><p>{tender.submission_deadline ? new Date(tender.submission_deadline).toLocaleString("en-ET") : "Deadline not set"}</p><p className="mt-1">{tender.estimated_value ? `${tender.currency_code || "ETB"} ${Number(tender.estimated_value).toLocaleString()}` : "Value not set"}</p></div><Link href={`/workspace/tenders/${tender.id}`} className="inline-flex min-h-9 items-center rounded-lg border border-[var(--betanor-border)] px-3 text-xs font-semibold text-[var(--betanor-blue)] hover:bg-white">{canEdit && tender.status !== "SUBMITTED" ? "Open & edit" : "Open tender"} →</Link></div>
      </article>)}</div> : <p className="px-5 py-12 text-center text-sm text-[var(--betanor-muted)]">{tenders.length ? "No tenders match these filters." : "No tenders are visible yet."}</p>}
    </Card>
  </>;
}
