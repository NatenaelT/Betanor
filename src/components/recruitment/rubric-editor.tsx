"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";
import { SCORE_ANCHORS, type RecruitmentCriterion, type RecruitmentStage } from "@/lib/recruitment/rubrics";

export function RubricEditor({
  stage,
  initial,
}: {
  stage: RecruitmentStage;
  initial: RecruitmentCriterion[];
}) {
  const [criteria, setCriteria] = useState(initial);
  const idPrefix = `${stage}-rubric`;
  const totalWeight = criteria.reduce((sum, criterion) => sum + (Number(criterion.weight) || 0), 0);
  const stageLabel = stage === "shortlisting" ? "Shortlisting" : "Structured interview";

  function patchCriterion(index: number, patch: Partial<RecruitmentCriterion>) {
    setCriteria((current) => current.map((criterion, itemIndex) => itemIndex === index ? { ...criterion, ...patch } : criterion));
  }

  function addCriterion() {
    if (criteria.length >= 8) return;
    const key = `criterion_${Math.random().toString(36).slice(2, 12)}`;
    setCriteria((current) => [...current, {
      key,
      label: "",
      definition: "",
      evidenceGuide: "",
      weight: 0,
      gate: false,
    }]);
  }

  return <section className="rounded-xl border border-[var(--betanor-border)] bg-slate-50/70 p-4 sm:p-5">
    <input type="hidden" name={`${stage}Rubric`} value={JSON.stringify(criteria)} />
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <h3 className="font-semibold text-[var(--betanor-navy)]">{stageLabel} scoring rubric</h3>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--betanor-muted)]">Use job-related criteria, publish the same rubric before applications are assessed, and total weights to 100%. Every rating must cite specific evidence. Do not score protected personal traits or general “culture fit.”</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={addCriterion} disabled={criteria.length >= 8}>Add criterion</Button>
    </div>

    <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
      <p className="text-xs font-semibold text-[var(--betanor-navy)]">Shared behaviorally anchored scale — apply consistently</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{SCORE_ANCHORS.map((anchor) => <p key={anchor.score} className="text-[11px] leading-4 text-[var(--betanor-muted)]"><span className="font-semibold text-[var(--betanor-navy)]">{anchor.score} · {anchor.label}:</span> {anchor.description}</p>)}</div>
    </div>

    <div className="mt-3 space-y-3">
      {criteria.map((criterion, index) => <div key={criterion.key} className="grid gap-3 rounded-lg border border-[var(--betanor-border)] bg-white p-3 sm:grid-cols-2 sm:p-4">
        <div><FieldLabel htmlFor={`${idPrefix}-label-${index}`} required>Criterion</FieldLabel><Input id={`${idPrefix}-label-${index}`} value={criterion.label} onChange={(event) => patchCriterion(index, { label: event.target.value })} maxLength={120} placeholder="e.g. Troubleshooting and root-cause analysis" /></div>
        <div><FieldLabel htmlFor={`${idPrefix}-weight-${index}`} required>Weight (%)</FieldLabel><Input id={`${idPrefix}-weight-${index}`} type="number" min="1" max="100" step="1" value={criterion.weight || ""} onChange={(event) => patchCriterion(index, { weight: event.target.value === "" ? 0 : Number(event.target.value) })} /></div>
        <div className="sm:col-span-2"><FieldLabel htmlFor={`${idPrefix}-definition-${index}`} required>Job-related standard</FieldLabel><textarea id={`${idPrefix}-definition-${index}`} value={criterion.definition} onChange={(event) => patchCriterion(index, { definition: event.target.value })} maxLength={360} rows={2} placeholder="Describe only a capability explicitly required by this role." className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm" /></div>
        <div className="sm:col-span-2"><FieldLabel htmlFor={`${idPrefix}-evidence-${index}`} required>Evidence to collect / consistent question</FieldLabel><textarea id={`${idPrefix}-evidence-${index}`} value={criterion.evidenceGuide} onChange={(event) => patchCriterion(index, { evidenceGuide: event.target.value })} maxLength={500} rows={2} placeholder={stage === "interview" ? "Use the same question or practical scenario for every candidate." : "State the CV section, qualification, answer, or work sample to check."} className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm" /></div>
        <label className="flex items-start gap-2 text-xs leading-5 text-[var(--betanor-text)] sm:col-span-2"><input type="checkbox" checked={criterion.gate} onChange={(event) => patchCriterion(index, { gate: event.target.checked })} className="mt-1 accent-[var(--betanor-navy)]" /><span><span className="font-semibold">Minimum gate.</span> Rating below 3 blocks the “meets threshold” recommendation, regardless of total score.</span></label>
        <div className="flex justify-between gap-3 sm:col-span-2"><span className="text-[11px] text-[var(--betanor-muted)]">Criterion {index + 1} of {criteria.length}</span><Button type="button" size="sm" variant="ghost" onClick={() => setCriteria((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-[var(--betanor-danger)]">Remove</Button></div>
      </div>)}
    </div>
    <p className={`mt-3 text-xs font-semibold ${totalWeight === 100 ? "text-emerald-700" : "text-amber-800"}`}>Weights total {totalWeight}% {totalWeight === 100 ? "· ready to save" : "· must total exactly 100% to save"}</p>
  </section>;
}
