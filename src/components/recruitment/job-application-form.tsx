"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { applyToJob } from "@/app/careers/actions";
import { createClient } from "@/lib/supabase/client";
import type { ApplicationAnswer, ApplicationFormField } from "@/lib/recruitment/forms";

const bucket = "betanor-candidate-documents";
const mimeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const maxFileBytes = 10 * 1024 * 1024;

function fileExtension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

async function hasExpectedFileSignature(file: File, extension: string) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (extension === "pdf") return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (extension === "doc") return bytes.slice(0, 8).join(",") === "208,207,17,224,161,177,26,225";
  if (extension === "docx") return bytes[0] === 80 && bytes[1] === 75 && [3, 5, 7].includes(bytes[2]);
  return false;
}

function isVisible(field: ApplicationFormField, responses: Record<string, ApplicationAnswer>) {
  if (!field.showWhen) return true;
  const answer = responses[field.showWhen.fieldKey];
  return Array.isArray(answer) ? answer.includes(field.showWhen.equals) : answer === field.showWhen.equals;
}

export function JobApplicationForm({ jobOpeningId, fields }: { jobOpeningId: string; fields: ApplicationFormField[] }) {
  const router = useRouter();
  const [responses, setResponses] = useState<Record<string, ApplicationAnswer>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function updateResponse(key: string, value: ApplicationAnswer) {
    setResponses((current) => ({ ...current, [key]: value }));
  }

  function updateCheckboxResponse(key: string, option: string, checked: boolean) {
    setResponses((current) => {
      const selected = Array.isArray(current[key]) ? current[key] as string[] : [];
      const next = checked ? [...new Set([...selected, option])] : selected.filter((value) => value !== option);
      return { ...current, [key]: next };
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const resume = data.get("resumeFile");
    const coverLetter = data.get("coverLetterFile");

    if (!(resume instanceof File) || resume.size === 0) {
      setError("Please attach your CV or resume.");
      setBusy(false);
      return;
    }
    const customFiles = fields.filter((field) => field.type === "file_upload" && isVisible(field, responses))
      .map((field) => [field, data.get(`customFile-${field.key}`)] as const);
    for (const [label, file] of [["CV or resume", resume], ["Cover letter", coverLetter], ...customFiles.map(([field, file]) => [field.label, file] as const)] as const) {
      if (!(file instanceof File) || file.size === 0) continue;
      const extension = fileExtension(file);
      if (!mimeByExtension[extension] || file.size > maxFileBytes || !await hasExpectedFileSignature(file, extension)) {
        setError(`${label} must be a PDF, DOC, or DOCX file under 10 MB.`);
        setBusy(false);
        return;
      }
    }

    const supabase = createClient();
    const uploadId = crypto.randomUUID();
    const uploadedPaths: string[] = [];
    const uploadOne = async (file: File, slot: string) => {
      const extension = fileExtension(file);
      const path = `intake/${uploadId}/${slot}.${extension}`;
      const { data: uploaded, error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: mimeByExtension[extension],
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError || !uploaded?.path) throw new Error(uploadError?.message || `Could not upload ${slot === "resume" ? "CV" : "cover letter"}.`);
      uploadedPaths.push(uploaded.path);
      return uploaded.path;
    };

    try {
      const resumePath = await uploadOne(resume, "resume");
      const coverLetterPath = coverLetter instanceof File && coverLetter.size ? await uploadOne(coverLetter, "cover-letter") : "";
      const attachmentResponses = await Promise.all(customFiles.map(async ([field, file]) => [
        field.key,
        file instanceof File && file.size ? await uploadOne(file, `attachment-${field.key}`) : "",
      ] as const));
      const fileAnswers = new Map(attachmentResponses);
      const formResponses = Object.fromEntries(fields.filter((field) => isVisible(field, responses)).map((field) => [field.key, field.type === "file_upload" ? fileAnswers.get(field.key) ?? "" : responses[field.key] ?? ""]));
      data.delete("resumeFile");
      data.delete("coverLetterFile");
      for (const field of fields) if (field.type === "file_upload") data.delete(`customFile-${field.key}`);
      data.set("resumePath", resumePath);
      data.set("coverLetterPath", coverLetterPath);
      data.set("formResponses", JSON.stringify(formResponses));
      data.set("jobOpeningId", jobOpeningId);
    } catch (uploadError) {
      if (uploadedPaths.length) await supabase.storage.from(bucket).remove(uploadedPaths);
      setError(uploadError instanceof Error ? uploadError.message : "An attachment could not be uploaded. Please try again.");
      setBusy(false);
      return;
    }

    const result = await applyToJob(data);
    if (!result.ok) {
      if (uploadedPaths.length) await supabase.storage.from(bucket).remove(uploadedPaths);
      setError(result.message || "We could not submit your application. Please check the form and try again.");
      setBusy(false);
      return;
    }
    router.push("/careers?submitted=1");
    router.refresh();
  }

  return <form onSubmit={onSubmit} className="rounded-xl bg-slate-50 p-5">
    <input type="hidden" name="jobOpeningId" value={jobOpeningId} />
    <h4 className="font-semibold text-[var(--betanor-navy)]">Apply for this role</h4>
    <p className="mt-1 text-xs leading-5 text-[var(--betanor-muted)]">Email and a CV/resume are required. Names, custom questions, and a cover letter are optional unless an HR question is specifically marked required.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div><FieldLabel htmlFor={`candidate-first-${jobOpeningId}`}>First name</FieldLabel><Input id={`candidate-first-${jobOpeningId}`} name="firstName" maxLength={100} autoComplete="given-name" /></div>
      <div><FieldLabel htmlFor={`candidate-last-${jobOpeningId}`}>Last name</FieldLabel><Input id={`candidate-last-${jobOpeningId}`} name="lastName" maxLength={100} autoComplete="family-name" /></div>
      <div className="sm:col-span-2"><FieldLabel htmlFor={`candidate-email-${jobOpeningId}`} required>Email</FieldLabel><Input id={`candidate-email-${jobOpeningId}`} name="email" required type="email" maxLength={254} autoComplete="email" /></div>
      <div className="sm:col-span-2"><FieldLabel htmlFor={`candidate-phone-${jobOpeningId}`}>Phone</FieldLabel><Input id={`candidate-phone-${jobOpeningId}`} name="phone" type="tel" maxLength={40} autoComplete="tel" /></div>
    </div>

    {fields.length ? <fieldset className="mt-4 space-y-3"><legend className="mb-2 text-sm font-semibold text-[var(--betanor-navy)]">Role-specific questions</legend>{fields.filter((field) => isVisible(field, responses)).map((field) => {
      const id = `candidate-${field.key}-${jobOpeningId}`;
      const answer = responses[field.key];
      const choices = field.type === "yes_no" ? ["yes", "no"] : field.options ?? [];
      const scaleMin = field.scaleMin ?? 1;
      const scaleMax = field.scaleMax ?? 5;
      const scaleChoices = Array.from({ length: Math.max(0, scaleMax - scaleMin + 1) }, (_, index) => String(scaleMin + index));
      return <div key={field.key} className="rounded-lg border border-[var(--betanor-border)] bg-white p-3">
        <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
        {field.type === "short_answer" ? <Input id={id} value={typeof answer === "string" ? answer : ""} onChange={(event) => updateResponse(field.key, event.target.value)} maxLength={1000} /> : null}
        {field.type === "long_answer" ? <textarea id={id} value={typeof answer === "string" ? answer : ""} onChange={(event) => updateResponse(field.key, event.target.value)} rows={4} maxLength={5000} className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm" /> : null}
        {field.type === "dropdown" ? <select id={id} value={typeof answer === "string" ? answer : ""} onChange={(event) => updateResponse(field.key, event.target.value)} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Select an answer (optional)</option>{choices.map((option) => <option key={option} value={option}>{option}</option>)}</select> : null}
        {field.type === "radio" || field.type === "yes_no" ? <div role="radiogroup" aria-label={field.label} className="mt-2 grid gap-2 sm:grid-cols-2">{choices.map((option, optionIndex) => <label key={option} htmlFor={`${id}-${optionIndex}`} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-[var(--betanor-border)] px-3 text-sm"><input id={`${id}-${optionIndex}`} type="radio" name={id} value={option} checked={answer === option} onChange={() => updateResponse(field.key, option)} />{option === "yes" ? "Yes" : option === "no" ? "No" : option}</label>)}</div> : null}
        {field.type === "checkboxes" ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{choices.map((option, optionIndex) => <label key={option} htmlFor={`${id}-${optionIndex}`} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-[var(--betanor-border)] px-3 text-sm"><input id={`${id}-${optionIndex}`} type="checkbox" value={option} checked={Array.isArray(answer) && answer.includes(option)} onChange={(event) => updateCheckboxResponse(field.key, option, event.target.checked)} />{option}</label>)}</div> : null}
        {field.type === "linear_scale" ? <><div role="radiogroup" aria-label={field.label} className="mt-2 flex flex-wrap gap-2">{scaleChoices.map((option) => <label key={option} htmlFor={`${id}-${option}`} className={`flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm ${answer === option ? "border-[var(--betanor-navy)] bg-[var(--betanor-navy)] text-white" : "border-[var(--betanor-border)] bg-white"}`}><input className="sr-only" id={`${id}-${option}`} type="radio" name={id} value={option} checked={answer === option} onChange={() => updateResponse(field.key, option)} />{option}</label>)}</div><div className="mt-1 flex justify-between gap-3 text-xs text-[var(--betanor-muted)]"><span>{field.scaleMinLabel || scaleMin}</span><span>{field.scaleMaxLabel || scaleMax}</span></div></> : null}
        {field.type === "number" ? <Input id={id} type="number" step="any" min={field.numberMin} max={field.numberMax} value={typeof answer === "string" ? answer : ""} onChange={(event) => updateResponse(field.key, event.target.value)} /> : null}
        {field.type === "date" ? <Input id={id} type="date" value={typeof answer === "string" ? answer : ""} onChange={(event) => updateResponse(field.key, event.target.value)} /> : null}
        {field.type === "time" ? <Input id={id} type="time" value={typeof answer === "string" ? answer : ""} onChange={(event) => updateResponse(field.key, event.target.value)} /> : null}
        {field.type === "email" ? <Input id={id} type="email" autoComplete="email" value={typeof answer === "string" ? answer : ""} onChange={(event) => updateResponse(field.key, event.target.value)} maxLength={254} /> : null}
        {field.type === "phone" ? <Input id={id} type="tel" autoComplete="tel" value={typeof answer === "string" ? answer : ""} onChange={(event) => updateResponse(field.key, event.target.value)} maxLength={40} /> : null}
        {field.type === "url" ? <Input id={id} type="url" inputMode="url" value={typeof answer === "string" ? answer : ""} onChange={(event) => updateResponse(field.key, event.target.value)} maxLength={500} placeholder="https://" /> : null}
        {field.type === "file_upload" ? <><input id={id} name={`customFile-${field.key}`} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="block min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" /><p className="mt-1 text-xs text-[var(--betanor-muted)]">Optional · PDF, DOC, or DOCX · maximum 10 MB</p></> : null}
      </div>;
    })}</fieldset> : null}

    <div className="mt-4 space-y-3">
      <div><FieldLabel htmlFor={`candidate-resume-${jobOpeningId}`} required>CV / Resume</FieldLabel><input id={`candidate-resume-${jobOpeningId}`} name="resumeFile" type="file" required accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="block min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" /><p className="mt-1 text-xs text-[var(--betanor-muted)]">PDF, DOC, or DOCX · maximum 10 MB</p></div>
      <div><FieldLabel htmlFor={`candidate-cover-${jobOpeningId}`}>Cover letter attachment</FieldLabel><input id={`candidate-cover-${jobOpeningId}`} name="coverLetterFile" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="block min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" /><p className="mt-1 text-xs text-[var(--betanor-muted)]">Optional · PDF, DOC, or DOCX · maximum 10 MB</p></div>
    </div>
    {error ? <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
    <Button type="submit" disabled={busy} className="mt-4 w-full">{busy ? "Submitting…" : "Submit application"}</Button>
  </form>;
}
