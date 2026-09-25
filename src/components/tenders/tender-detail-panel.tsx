"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";

const checklistCategories = [
  "Technical",
  "Financial",
  "Licences & Registrations",
  "Legal",
  "Administrative",
  "Security & Guarantees",
  "Submission",
  "Other",
] as const;

type Requirement = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  is_mandatory: boolean;
  is_complete: boolean;
  attachment_path?: string | null;
  attachment_file_name?: string | null;
  attachment_mime_type?: string | null;
  attachment_size_bytes?: number | null;
};
type Guarantee = { id: string; guarantee_type: string; reference_number: string; financial_institution?: string | null; amount: number; expiry_date?: string | null; status: string };
type TenderDetail = { id: string; title: string; reference_number: string; procuring_organization?: string | null; status: string; submission_deadline?: string | null; estimated_value?: number | null; currency_code?: string | null };

export function TenderDetailPanel({
  tender,
  requirements,
  guarantees,
  canEdit,
  canGuarantee,
  canSubmit,
}: {
  tender: TenderDetail;
  requirements: Requirement[];
  guarantees: Guarantee[];
  canEdit: boolean;
  canGuarantee: boolean;
  canSubmit: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState(requirements);
  const groups = useMemo(() => {
    const grouped = new Map<string, Requirement[]>();
    for (const item of checks) {
      const category = item.category || "Other";
      grouped.set(category, [...(grouped.get(category) ?? []), item]);
    }
    return [...grouped.entries()];
  }, [checks]);
  const locked = tender.status === "SUBMITTED";

  async function request(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    setMessage("");
    const response = await fetch(path, {
      method,
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "Could not save the change.");
      return null;
    }
    return data;
  }

  async function post(path: string, body: unknown) {
    const result = await request(path, "POST", body);
    if (result) {
      setMessage("Saved.");
      window.location.reload();
    }
  }

  async function submit() {
    if (checks.some((item) => item.is_mandatory && !item.is_complete)) {
      setMessage("Complete every mandatory checklist item first.");
      return;
    }
    if (!window.confirm("Mark this tender as submitted? The final submission snapshot will be preserved.")) return;
    await post(`/api/tenders/${tender.id}/submission`, {});
  }

  async function updateComplete(item: Requirement) {
    const next = !item.is_complete;
    const result = await request(`/api/tenders/${tender.id}/requirements`, "PATCH", { id: item.id, isComplete: next });
    if (result) setChecks((current) => current.map((row) => row.id === item.id ? result.requirement : row));
  }

  async function saveItem(event: React.FormEvent<HTMLFormElement>, item: Requirement) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await request(`/api/tenders/${tender.id}/requirements`, "PATCH", {
      id: item.id,
      title: String(form.get("title") ?? ""),
      category: String(form.get("category") ?? "Other"),
      description: String(form.get("description") ?? ""),
      isMandatory: form.get("isMandatory") === "on",
    });
    if (result) setChecks((current) => current.map((row) => row.id === item.id ? result.requirement : row));
  }

  async function uploadAttachment(event: React.FormEvent<HTMLFormElement>, item: Requirement) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) {
      setMessage("Choose a file first. Uploads are optional.");
      return;
    }
    const result = await request(`/api/tenders/${tender.id}/requirements/${item.id}/attachment`, "POST", form);
    if (result) {
      setMessage("Checklist file uploaded.");
      window.location.reload();
    }
  }

  async function deleteItem(item: Requirement) {
    if (!window.confirm(`Delete checklist item “${item.title}”? This cannot be undone.`)) return;
    const result = await request(`/api/tenders/${tender.id}/requirements?requirementId=${item.id}`, "DELETE");
    if (result) setChecks((current) => current.filter((row) => row.id !== item.id));
  }

  async function deleteAttachment(item: Requirement) {
    const result = await request(`/api/tenders/${tender.id}/requirements/${item.id}/attachment`, "DELETE");
    if (result) setChecks((current) => current.map((row) => row.id === item.id ? { ...row, attachment_path: null, attachment_file_name: null } : row));
  }

  return <div className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Tender brief</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--betanor-navy)]">{tender.title}</h2>
            <p className="mt-1 text-sm text-[var(--betanor-muted)]">{tender.reference_number} · {tender.procuring_organization || "Organization not recorded"}</p>
          </div>
          <Badge tone={tender.status === "SUBMITTED" ? "success" : "info"}>{String(tender.status).replaceAll("_", " ")}</Badge>
        </div>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-[var(--betanor-muted)]">Submission deadline</dt><dd className="mt-1 font-semibold text-[var(--betanor-navy)]">{tender.submission_deadline ? new Date(tender.submission_deadline).toLocaleString("en-ET") : "Not set"}</dd></div>
          <div><dt className="text-xs text-[var(--betanor-muted)]">Estimated value</dt><dd className="mt-1 font-semibold text-[var(--betanor-navy)]">{tender.estimated_value ? `${tender.currency_code} ${Number(tender.estimated_value).toLocaleString()}` : "Not set"}</dd></div>
        </dl>
        {canEdit ? <div className="mt-6 flex flex-wrap gap-2"><Button variant="outline" onClick={() => void post(`/api/tenders/${tender.id}/submission-letter`, {})} disabled={busy}>Prepare submission letter</Button>{!locked ? <Button onClick={() => void submit()} disabled={busy || !canSubmit}>Finalize submission</Button> : null}</div> : null}
        {message ? <p className="mt-3 text-sm text-[var(--betanor-muted)]" role="status">{message}</p> : null}
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div><h2 className="font-semibold text-[var(--betanor-navy)]">Submission checklist</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">Group requirements by category. Attachments are optional; CPO and bank guarantees are not mandatory unless the tender requires them.</p></div>
          <span className="text-xs text-[var(--betanor-muted)]">{checks.filter((item) => item.is_complete).length}/{checks.length} complete</span>
        </div>
        {groups.length ? <div className="mt-5 space-y-6">{groups.map(([category, items]) => <section key={category} aria-label={category}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--betanor-blue)]">{category}</h3>
          <div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-xl border border-[var(--betanor-border)] p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <input type="checkbox" aria-label={`Mark ${item.title} complete`} className="mt-1 size-4 accent-[var(--betanor-blue)]" checked={item.is_complete} disabled={!canEdit || locked || busy} onChange={() => void updateComplete(item)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h4 className="font-medium text-[var(--betanor-navy)]">{item.title}</h4><Badge tone={item.is_mandatory ? "warning" : "info"}>{item.is_mandatory ? "Required" : "Optional"}</Badge></div>
                {item.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--betanor-muted)]">{item.description}</p> : null}
                {item.attachment_file_name ? <div className="mt-2 flex flex-wrap items-center gap-3 text-xs"><a className="font-semibold text-[var(--betanor-blue)] underline" href={`/api/tenders/${tender.id}/requirements/${item.id}/attachment`} target="_blank" rel="noreferrer">📎 {item.attachment_file_name}</a><span className="text-[var(--betanor-muted)]">{item.attachment_size_bytes ? `${(Number(item.attachment_size_bytes) / 1024 / 1024).toFixed(1)} MB` : ""}</span>{canEdit && !locked ? <button type="button" className="text-rose-700 hover:underline" onClick={() => void deleteAttachment(item)}>Remove file</button> : null}</div> : null}
                {canEdit && !locked ? <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-[var(--betanor-blue)]">Edit checklist item</summary>
                  <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void saveItem(event, item)}>
                    <div className="sm:col-span-2"><FieldLabel required htmlFor={`title-${item.id}`}>Requirement</FieldLabel><Input id={`title-${item.id}`} name="title" defaultValue={item.title} required maxLength={240} /></div>
                    <div><FieldLabel htmlFor={`category-${item.id}`}>Category</FieldLabel><select id={`category-${item.id}`} name="category" defaultValue={item.category || "Other"} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm">{checklistCategories.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                    <label className="flex items-center gap-2 self-end pb-2 text-sm"><input name="isMandatory" type="checkbox" defaultChecked={item.is_mandatory} className="size-4 accent-[var(--betanor-blue)]" />Required to submit</label>
                    <div className="sm:col-span-2"><FieldLabel htmlFor={`description-${item.id}`}>Notes</FieldLabel><textarea id={`description-${item.id}`} name="description" defaultValue={item.description || ""} rows={2} maxLength={2000} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" /></div>
                    <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" size="sm" variant="outline" disabled={busy}>Save changes</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void deleteItem(item)}>Delete item</Button></div>
                  </form>
                  <form className="mt-3 flex flex-col gap-2 border-t border-[var(--betanor-border)] pt-3 sm:flex-row sm:items-center" onSubmit={(event) => void uploadAttachment(event, item)}>
                    <Input name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt" aria-label="Optional checklist attachment" />
                    <Button type="submit" size="sm" variant="outline" disabled={busy}>Upload optional file</Button>
                  </form>
                </details> : null}
              </div>
            </div>
          </article>)}</div>
        </section>)}</div> : <p className="mt-4 text-sm text-[var(--betanor-muted)]">No checklist items yet.</p>}
        {canEdit && !locked ? <form className="mt-5 grid gap-3 border-t border-[var(--betanor-border)] pt-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void post(`/api/tenders/${tender.id}/requirements`, { title: data.get("title"), category: data.get("category"), description: data.get("description"), isMandatory: data.get("isMandatory") === "on" });  }}>
          <div className="sm:col-span-2"><FieldLabel required htmlFor="new-requirement-title">New checklist item</FieldLabel><Input id="new-requirement-title" name="title" placeholder="e.g. Approved technical proposal" required maxLength={240} /></div>
          <div><FieldLabel htmlFor="new-requirement-category">Category</FieldLabel><select id="new-requirement-category" name="category" defaultValue="Technical" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm">{checklistCategories.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input name="isMandatory" type="checkbox" className="size-4 accent-[var(--betanor-blue)]" />Required to submit</label>
          <div className="sm:col-span-2"><FieldLabel htmlFor="new-requirement-description">Notes</FieldLabel><textarea id="new-requirement-description" name="description" rows={2} maxLength={2000} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" /></div>
          <div className="sm:col-span-2"><Button size="sm" type="submit" disabled={busy}>Add checklist item</Button><p className="mt-2 text-xs text-[var(--betanor-muted)]">New items are optional by default. Mark a requirement only when this tender makes it mandatory.</p></div>
        </form> : null}
      </Card>
    </div>

    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-[var(--betanor-navy)]">CPO & bank guarantees</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">Optional tracking. Add a security only when applicable.</p></div><span className="text-xs text-[var(--betanor-muted)]">{guarantees.length} record{guarantees.length === 1 ? "" : "s"}</span></div>
        {guarantees.length ? <div className="mt-4 space-y-2">{guarantees.map((guarantee) => <div key={guarantee.id} className="rounded-lg border border-[var(--betanor-border)] p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[var(--betanor-navy)]">{guarantee.guarantee_type.replaceAll("_", " ")}</p><Badge tone={guarantee.status === "ACTIVE" ? "success" : "warning"}>{guarantee.status}</Badge></div><p className="mt-1 text-xs text-[var(--betanor-muted)]">{guarantee.reference_number} · {guarantee.financial_institution || "Institution not set"}</p><p className="mt-2 text-sm font-semibold text-[var(--betanor-navy)]">{guarantee.amount.toLocaleString()} · expires {guarantee.expiry_date || "not set"}</p></div>)}</div> : <p className="mt-4 text-sm text-[var(--betanor-muted)]">No guarantees recorded.</p>}
        {canGuarantee && !locked ? <form className="mt-5 grid gap-3" onSubmit={(event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget).entries()); void post(`/api/tenders/${tender.id}/guarantees`, body); }}>
          <div className="grid gap-3 sm:grid-cols-2"><div><FieldLabel required htmlFor="guarantee-reference">Reference</FieldLabel><Input id="guarantee-reference" name="referenceNumber" required /></div><div><FieldLabel required htmlFor="guarantee-type">Type</FieldLabel><select id="guarantee-type" name="guaranteeType" className="min-h-10 w-full rounded-lg border px-3 text-sm"><option value="CPO">CPO</option><option value="BANK_GUARANTEE">Bank guarantee</option><option value="BID_SECURITY">Bid security</option><option value="PERFORMANCE_GUARANTEE">Performance guarantee</option><option value="ADVANCE_PAYMENT_GUARANTEE">Advance payment guarantee</option><option value="OTHER_GUARANTEE">Other</option></select></div><div><FieldLabel htmlFor="guarantee-bank">Bank / institution</FieldLabel><Input id="guarantee-bank" name="financialInstitution" /></div><div><FieldLabel required htmlFor="guarantee-amount">Amount</FieldLabel><Input id="guarantee-amount" name="amount" type="number" min="0" step="0.01" defaultValue="0" /></div><div><FieldLabel htmlFor="guarantee-expiry">Expiry</FieldLabel><Input id="guarantee-expiry" name="expiryDate" type="date" /></div><div><FieldLabel htmlFor="guarantee-status">Status</FieldLabel><select id="guarantee-status" name="status" className="min-h-10 w-full rounded-lg border px-3 text-sm"><option value="REQUESTED">Requested</option><option value="IN_PREPARATION">In preparation</option><option value="ISSUED">Issued</option><option value="ACTIVE">Active</option></select></div></div><Button size="sm" type="submit" disabled={busy}>Add optional guarantee</Button>
        </form> : null}
      </Card>
    </div>
  </div>;
}
