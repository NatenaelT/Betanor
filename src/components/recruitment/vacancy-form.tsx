"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { fieldKeyFromLabel, type ApplicationFormField, type ApplicationFieldType } from "@/lib/recruitment/forms";

type Choice = { id: string; label: string; departmentId?: string | null };
type VacancyValues = {
  id?: string;
  title?: string | null;
  code?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  employmentType?: string | null;
  workplace?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  opensOn?: string | null;
  closesOn?: string | null;
  description?: string | null;
  requirements?: string | null;
  instructions?: string | null;
  status?: string | null;
  applicationFormSchema?: ApplicationFormField[] | null;
};

const fieldTypes: Array<[ApplicationFieldType, string]> = [["select", "Dropdown"], ["yes_no", "Yes / No dropdown"]];

export function VacancyForm({
  action,
  departments,
  positions,
  opening = {},
}: {
  action: (formData: FormData) => void | Promise<void>;
  departments: Choice[];
  positions: Choice[];
  opening?: VacancyValues;
}) {
  const [schema, setSchema] = useState<ApplicationFormField[]>(opening.applicationFormSchema ?? []);
  const [departmentId, setDepartmentId] = useState(opening.departmentId ?? "");

  function patchField(index: number, patch: Partial<ApplicationFormField>) {
    setSchema((current) => {
      const updated = current.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field);
      const changed = updated[index];
      const values = changed.type === "select" ? changed.options ?? [] : ["yes", "no"];
      return updated.map((field, fieldIndex) => fieldIndex > index && field.showWhen?.fieldKey === changed.key && !values.includes(field.showWhen.equals)
        ? { ...field, showWhen: { ...field.showWhen, equals: "" } }
        : field);
    });
  }

  function setLabel(index: number, label: string) {
    setSchema((current) => {
      const updated = [...current];
      const base = fieldKeyFromLabel(label);
      let key = base;
      let suffix = 2;
      while (updated.some((field, otherIndex) => otherIndex !== index && field.key === key)) key = `${base.slice(0, 36)}_${suffix++}`;
      const previousKey = updated[index].key;
      updated[index] = { ...updated[index], label, key };
      return updated.map((field, fieldIndex) => fieldIndex > index && field.showWhen?.fieldKey === previousKey
        ? { ...field, showWhen: { ...field.showWhen, fieldKey: key } }
        : field);
    });
  }

  function removeField(index: number) {
    setSchema((current) => {
      const removedKey = current[index]?.key;
      return current.filter((_, fieldIndex) => fieldIndex !== index).map((field) => field.showWhen?.fieldKey === removedKey
        ? { ...field, showWhen: undefined }
        : field);
    });
  }

  function addField() {
    if (schema.length >= 25) return;
    let index = schema.length + 1;
    let key = `field_${index}`;
    while (schema.some((field) => field.key === key)) key = `field_${++index}`;
    setSchema((current) => [...current, { key, label: "", type: "select", required: false, options: ["Option 1", "Option 2"] }]);
  }

  return <form action={action} className="grid gap-4">
    {opening.id ? <input type="hidden" name="openingId" value={opening.id} /> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><FieldLabel htmlFor={`vacancy-title-${opening.id ?? "new"}`} required>Job title</FieldLabel><Input id={`vacancy-title-${opening.id ?? "new"}`} name="title" defaultValue={opening.title ?? ""} maxLength={180} required /></div>
      <div><FieldLabel htmlFor={`vacancy-code-${opening.id ?? "new"}`}>Internal job code</FieldLabel><Input id={`vacancy-code-${opening.id ?? "new"}`} name="code" defaultValue={opening.code ?? ""} maxLength={50} placeholder="Generated if blank" /></div>
      <div><FieldLabel htmlFor={`vacancy-department-${opening.id ?? "new"}`}>Department</FieldLabel><select id={`vacancy-department-${opening.id ?? "new"}`} name="departmentId" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Select department (optional)</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.label}</option>)}</select></div>
      <div><FieldLabel htmlFor={`vacancy-position-${opening.id ?? "new"}`}>Position</FieldLabel><select id={`vacancy-position-${opening.id ?? "new"}`} name="positionId" defaultValue={opening.positionId ?? ""} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Select position (optional)</option>{positions.filter((position) => !position.departmentId || !departmentId || position.departmentId === departmentId).map((position) => <option key={position.id} value={position.id}>{position.label}</option>)}</select></div>
      <div><FieldLabel htmlFor={`vacancy-type-${opening.id ?? "new"}`}>Employment type</FieldLabel><select id={`vacancy-type-${opening.id ?? "new"}`} name="employmentType" defaultValue={opening.employmentType ?? "full_time"} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="internship">Internship</option></select></div>
      <div><FieldLabel htmlFor={`vacancy-workplace-${opening.id ?? "new"}`}>Workplace</FieldLabel><Input id={`vacancy-workplace-${opening.id ?? "new"}`} name="workplace" defaultValue={opening.workplace ?? "Addis Ababa, Ethiopia"} maxLength={120} /></div>
      <div><FieldLabel htmlFor={`vacancy-salary-min-${opening.id ?? "new"}`}>Salary minimum (ETB/month)</FieldLabel><Input id={`vacancy-salary-min-${opening.id ?? "new"}`} name="salaryMin" defaultValue={opening.salaryMin ?? ""} type="number" min="0" step="100" /></div>
      <div><FieldLabel htmlFor={`vacancy-salary-max-${opening.id ?? "new"}`}>Salary maximum (ETB/month)</FieldLabel><Input id={`vacancy-salary-max-${opening.id ?? "new"}`} name="salaryMax" defaultValue={opening.salaryMax ?? ""} type="number" min="0" step="100" /></div>
      <div><FieldLabel htmlFor={`vacancy-opens-${opening.id ?? "new"}`}>Opening date</FieldLabel><Input id={`vacancy-opens-${opening.id ?? "new"}`} name="opensOn" defaultValue={opening.opensOn ?? ""} type="date" /></div>
      <div><FieldLabel htmlFor={`vacancy-closes-${opening.id ?? "new"}`}>Application deadline</FieldLabel><Input id={`vacancy-closes-${opening.id ?? "new"}`} name="closesOn" defaultValue={opening.closesOn ?? ""} type="date" /></div>
      <div className="sm:col-span-2"><FieldLabel htmlFor={`vacancy-description-${opening.id ?? "new"}`}>Role overview</FieldLabel><textarea id={`vacancy-description-${opening.id ?? "new"}`} name="description" defaultValue={opening.description ?? ""} rows={3} maxLength={10000} className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm" /></div>
      <div className="sm:col-span-2"><FieldLabel htmlFor={`vacancy-requirements-${opening.id ?? "new"}`}>Requirements</FieldLabel><textarea id={`vacancy-requirements-${opening.id ?? "new"}`} name="requirements" defaultValue={opening.requirements ?? ""} rows={3} maxLength={10000} className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm" /></div>
      <div className="sm:col-span-2"><FieldLabel htmlFor={`vacancy-instructions-${opening.id ?? "new"}`}>Application instructions</FieldLabel><textarea id={`vacancy-instructions-${opening.id ?? "new"}`} name="instructions" defaultValue={opening.instructions ?? ""} rows={2} maxLength={5000} className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm" /></div>
      <div><FieldLabel htmlFor={`vacancy-status-${opening.id ?? "new"}`}>Publication status</FieldLabel><select id={`vacancy-status-${opening.id ?? "new"}`} name="status" defaultValue={opening.status ?? "draft"} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="draft">Draft — HR only</option><option value="active">Active — publish to Careers</option><option value="inactive">Inactive — unpublish</option><option value="archived">Archived</option></select></div>
    </div>

    <section className="rounded-xl border border-[var(--betanor-border)] bg-slate-50/70 p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h3 className="font-semibold text-[var(--betanor-navy)]">Application form fields</h3><p className="mt-1 text-xs leading-5 text-[var(--betanor-muted)]">Applicants always provide email and a CV/resume. Names and cover-letter files are optional. Custom questions are optional unless marked required.</p></div><Button type="button" size="sm" variant="outline" onClick={addField} disabled={schema.length >= 25}>Add field</Button></div>
      <input type="hidden" name="applicationFormSchema" value={JSON.stringify(schema)} />
      {schema.length ? <div className="mt-4 space-y-3">{schema.map((field, index) => {
        const earlierFields = schema.slice(0, index);
        const dependency = earlierFields.find((candidate) => candidate.key === field.showWhen?.fieldKey);
        const compareValues = dependency?.type === "select" ? dependency.options ?? [] : dependency?.type === "yes_no" ? ["yes", "no"] : [];
        return <div key={`${field.key}-${index}`} className="grid gap-3 rounded-lg border border-[var(--betanor-border)] bg-white p-3 sm:grid-cols-2 sm:p-4">
          <div><FieldLabel htmlFor={`form-label-${opening.id ?? "new"}-${index}`} required>Question label</FieldLabel><Input id={`form-label-${opening.id ?? "new"}-${index}`} value={field.label} onChange={(event) => setLabel(index, event.target.value)} maxLength={100} placeholder="e.g. Highest qualification" /></div>
          <div><FieldLabel htmlFor={`form-type-${opening.id ?? "new"}-${index}`}>Answer type</FieldLabel><select id={`form-type-${opening.id ?? "new"}-${index}`} value={field.type} onChange={(event) => patchField(index, { type: event.target.value as ApplicationFieldType, options: event.target.value === "select" ? field.options?.length ? field.options : ["Option 1", "Option 2"] : undefined })} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm">{fieldTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          {field.type === "select" ? <div className="sm:col-span-2"><FieldLabel htmlFor={`form-options-${opening.id ?? "new"}-${index}`}>Dropdown options</FieldLabel><textarea id={`form-options-${opening.id ?? "new"}-${index}`} value={(field.options ?? []).join("\n")} onChange={(event) => patchField(index, { options: event.target.value.split("\n").map((option) => option.trim()).filter(Boolean).slice(0, 40) })} rows={3} placeholder={"One option per line\nBachelor’s degree\nMaster’s degree"} className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm" /></div> : null}
          <div><FieldLabel htmlFor={`form-condition-${opening.id ?? "new"}-${index}`}>Show only when</FieldLabel><select id={`form-condition-${opening.id ?? "new"}-${index}`} value={field.showWhen?.fieldKey ?? ""} onChange={(event) => patchField(index, { showWhen: event.target.value ? { fieldKey: event.target.value, equals: "" } : undefined })} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Always show</option>{earlierFields.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label || candidate.key}</option>)}</select></div>
          {field.showWhen?.fieldKey ? <div><FieldLabel htmlFor={`form-condition-value-${opening.id ?? "new"}-${index}`}>Answer that reveals this field</FieldLabel>{compareValues.length ? <select id={`form-condition-value-${opening.id ?? "new"}-${index}`} value={field.showWhen.equals} onChange={(event) => patchField(index, { showWhen: { ...field.showWhen!, equals: event.target.value } })} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Choose an answer</option>{compareValues.map((value) => <option key={value} value={value}>{value}</option>)}</select> : <Input id={`form-condition-value-${opening.id ?? "new"}-${index}`} value={field.showWhen.equals} onChange={(event) => patchField(index, { showWhen: { ...field.showWhen!, equals: event.target.value } })} placeholder="Exact answer" />}</div> : null}
          <div className="flex items-center justify-end gap-3 sm:col-span-2"><span className="text-xs text-[var(--betanor-muted)]">Optional for applicants</span><Button type="button" size="sm" variant="ghost" onClick={() => removeField(index)} className="text-[var(--betanor-danger)]">Remove field</Button></div>
        </div>;
      })}</div> : <p className="mt-4 rounded-lg border border-dashed border-[var(--betanor-border)] px-4 py-5 text-sm text-[var(--betanor-muted)]">No custom questions yet. You can add dropdowns, dates, numbers, and conditional fields.</p>}
    </section>

    <div className="flex flex-wrap items-center justify-end gap-2"><Button type="submit">{opening.id ? "Save vacancy changes" : "Save vacancy"}</Button></div>
  </form>;
}
