import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteVacancy, deleteVacancyTemplate, reviewApplication, saveVacancy, saveVacancyTemplate, submitRecruitmentEvaluation } from "@/app/workspace/recruitment/actions";
import { ApplicantDocumentViewer } from "@/components/recruitment/applicant-document-viewer";
import { VacancyForm } from "@/components/recruitment/vacancy-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { parseApplicationFormSchema, type ApplicationFormField } from "@/lib/recruitment/forms";
import { DEFAULT_INTERVIEW_RUBRIC, DEFAULT_SHORTLIST_RUBRIC, parseRecruitmentRubric, recruitmentPanelResult, type RecruitmentCriterion, type RecruitmentEvaluationItem, type RecruitmentStage } from "@/lib/recruitment/rubrics";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

type View = "vacancies" | "shortlisting" | "interviews" | "templates";
type VacancyRecord = {
  id: string; code: string | null; title: string; description: string | null; requirements: string | null;
  employment_type: string; workplace: string | null; salary_min: number | null; salary_max: number | null;
  opens_on: string | null; closes_on: string | null; application_instructions: string | null;
  application_form_schema: unknown; department_id: string | null; position_id: string | null;
  shortlisting_rubric: unknown; interview_rubric: unknown; shortlisting_threshold: number; interview_threshold: number;
  status: string; published_at: string | null; created_at: string;
};
type CandidateRecord = {
  id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null;
  education: string | null; years_experience: number | null; cover_letter: string | null;
  resume_path: string | null; cover_letter_path: string | null;
};
type RelatedOpening = {
  id: string; title: string; code: string | null; workspace_id: string; application_form_schema: unknown;
  shortlisting_rubric: unknown; interview_rubric: unknown; shortlisting_threshold: number; interview_threshold: number;
};
type RecruitmentApplication = {
  id: string; job_opening_id: string; candidate_id: string; stage: string; applied_at: string;
  notes: string | null; reviewed_at: string | null; interview_at: string | null; interview_location: string | null;
  interview_notes: string | null; hired_employee_id: string | null; form_responses: Record<string, unknown> | null;
  candidates: CandidateRecord | CandidateRecord[] | null; job_openings: RelatedOpening | RelatedOpening[] | null;
};
type RecruitmentEvaluation = {
  id: string;
  application_id: string;
  stage: RecruitmentStage;
  reviewer_id: string;
  rubric_snapshot: RecruitmentCriterion[];
  evaluation_items: Array<RecruitmentEvaluationItem & { label?: string; weight?: number }>;
  total_score: number;
  threshold_score: number;
  recommendation: "meets_threshold" | "below_threshold" | "gate_not_met";
  submitted_at: string;
};
type VacancyTemplate = {
  id: string; name: string; notes: string | null; default_title: string | null;
  department_id: string | null; position_id: string | null; employment_type: string;
  workplace: string | null; salary_min: number | null; salary_max: number | null;
  description: string | null; requirements: string | null; application_instructions: string | null;
  application_form_schema: unknown; shortlisting_rubric: unknown; interview_rubric: unknown;
  shortlisting_threshold: number; interview_threshold: number; created_at: string; updated_at: string;
};
const stageOptions = [["applied", "Applied"], ["screening", "Screening"], ["shortlisted", "Shortlisted"], ["interview", "Interview"], ["offered", "Offer extended"], ["hired", "Hired"], ["rejected", "Rejected"]] as const;

function localInterviewValue(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function interviewLabel(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Addis_Ababa" }).format(new Date(value)) : "Not scheduled";
}

function vacancyValues(opening: VacancyRecord) {
  let applicationFormSchema: ApplicationFormField[];
  try { applicationFormSchema = parseApplicationFormSchema(opening.application_form_schema); } catch { applicationFormSchema = []; }
  return {
    id: opening.id,
    title: opening.title,
    code: opening.code,
    departmentId: opening.department_id,
    positionId: opening.position_id,
    employmentType: opening.employment_type,
    workplace: opening.workplace,
    salaryMin: opening.salary_min,
    salaryMax: opening.salary_max,
    opensOn: opening.opens_on,
    closesOn: opening.closes_on,
    description: opening.description,
    requirements: opening.requirements,
    instructions: opening.application_instructions,
    status: opening.status,
    applicationFormSchema,
    shortlistingRubric: parseRecruitmentRubric(opening.shortlisting_rubric, "shortlisting"),
    interviewRubric: parseRecruitmentRubric(opening.interview_rubric, "interview"),
    shortlistingThreshold: opening.shortlisting_threshold,
    interviewThreshold: opening.interview_threshold,
  };
}

function templateValues(template: VacancyTemplate) {
  let applicationFormSchema: ApplicationFormField[];
  try { applicationFormSchema = parseApplicationFormSchema(template.application_form_schema); } catch { applicationFormSchema = []; }
  return {
    id: template.id,
    name: template.name,
    templateDescription: template.notes,
    title: template.default_title,
    departmentId: template.department_id,
    positionId: template.position_id,
    employmentType: template.employment_type,
    workplace: template.workplace,
    salaryMin: template.salary_min,
    salaryMax: template.salary_max,
    description: template.description,
    requirements: template.requirements,
    instructions: template.application_instructions,
    applicationFormSchema,
    shortlistingRubric: parseRecruitmentRubric(template.shortlisting_rubric, "shortlisting"),
    interviewRubric: parseRecruitmentRubric(template.interview_rubric, "interview"),
    shortlistingThreshold: template.shortlisting_threshold,
    interviewThreshold: template.interview_threshold,
  };
}

function directoryChoices(departments: Array<{ id: string; name: string; code: string | null }> | null) {
  return (departments ?? []).map((department) => ({ id: department.id, label: `${department.name}${department.code ? ` · ${department.code}` : ""}` }));
}

function positionChoices(positions: Array<{ id: string; title: string; code: string | null; department_id: string | null }> | null) {
  return (positions ?? []).map((position) => ({ id: position.id, label: `${position.title}${position.code ? ` · ${position.code}` : ""}`, departmentId: position.department_id }));
}

function templateQuestionCount(schema: unknown) {
  try { return parseApplicationFormSchema(schema).length; } catch { return 0; }
}

function ViewTabs({ current }: { current: View }) {
  const items: Array<{ id: View; href: string; label: string }> = [
    { id: "vacancies", href: "/workspace/recruitment", label: "Vacancies" },
    { id: "shortlisting", href: "/workspace/recruitment/shortlisting", label: "Shortlisting" },
    { id: "interviews", href: "/workspace/recruitment/interviews", label: "Interviews" },
    { id: "templates", href: "/workspace/recruitment/templates", label: "Vacancy templates" },
  ];
  return <nav aria-label="Recruitment views" className="mt-6 flex flex-wrap gap-2">{items.map((item) => <Link key={item.id} href={item.href} aria-current={current === item.id ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${current === item.id ? "border-[var(--betanor-navy)] bg-[var(--betanor-navy)] text-white" : "border-[var(--betanor-border)] bg-white text-[var(--betanor-navy)] hover:border-[var(--betanor-gold)]"}`}>{item.label}</Link>)}</nav>;
}

function ApplicantCard({ application, view, evaluations, reviewerNames, currentUserId }: {
  application: RecruitmentApplication;
  view: Exclude<View, "vacancies" | "templates">;
  evaluations: RecruitmentEvaluation[];
  reviewerNames: Map<string, string>;
  currentUserId: string;
}) {
  const candidate = Array.isArray(application.candidates) ? application.candidates[0] : application.candidates;
  const opening = Array.isArray(application.job_openings) ? application.job_openings[0] : application.job_openings;
  if (!candidate) return null;
  const responsePairs = Object.entries(application.form_responses ?? {}).filter((entry): entry is [string, string | string[]] => (typeof entry[1] === "string" && Boolean(entry[1])) || (Array.isArray(entry[1]) && entry[1].every((item) => typeof item === "string") && entry[1].length > 0));
  let fieldLabels = new Map<string, string>();
  let fieldTypes = new Map<string, ApplicationFormField["type"]>();
  try {
    const fields = parseApplicationFormSchema(opening?.application_form_schema);
    fieldLabels = new Map(fields.map((field) => [field.key, field.label]));
    fieldTypes = new Map(fields.map((field) => [field.key, field.type]));
  } catch { /* Show the safe field key when old schema data needs HR repair. */ }

  const evaluationStage: RecruitmentStage = view === "shortlisting" ? "shortlisting" : "interview";
  const rubric = (() => {
    try {
      const configured = evaluationStage === "shortlisting" ? opening?.shortlisting_rubric : opening?.interview_rubric;
      return parseRecruitmentRubric(configured, evaluationStage);
    } catch {
      return evaluationStage === "shortlisting" ? DEFAULT_SHORTLIST_RUBRIC : DEFAULT_INTERVIEW_RUBRIC;
    }
  })();
  const threshold = evaluationStage === "shortlisting" ? opening?.shortlisting_threshold ?? 70 : opening?.interview_threshold ?? 70;
  const stageEvaluations = evaluations.filter((evaluation) => evaluation.stage === evaluationStage).sort((left, right) => right.submitted_at.localeCompare(left.submitted_at));
  const panelResult = recruitmentPanelResult(rubric, stageEvaluations, threshold);
  const reviewerEntries = panelResult.latest;
  const panelAverage = panelResult.score;
  const ownEvaluation = reviewerEntries.find((evaluation) => evaluation.reviewer_id === currentUserId);
  const panelMeetsThreshold = panelResult.meetsThreshold;
  const returnTo = `/workspace/recruitment/${view === "shortlisting" ? "shortlisting" : "interviews"}`;

  return <Card className="p-4 sm:p-5">
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={application.stage === "hired" ? "success" : application.stage === "rejected" ? "neutral" : "info"}>{String(application.stage).replaceAll("_", " ")}</Badge><span className="text-xs text-[var(--betanor-muted)]">Applied {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Addis_Ababa" }).format(new Date(application.applied_at))}</span></div><h2 className="mt-2 break-words text-lg font-semibold text-[var(--betanor-navy)]">{candidate.first_name || "Name not provided"} {candidate.last_name || ""}</h2><p className="mt-1 break-all text-sm text-[var(--betanor-muted)]">{candidate.email}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">{opening?.title || "Vacancy"} · {opening?.code || ""}</p></div>{application.hired_employee_id ? <Link className="shrink-0 text-sm font-semibold text-[var(--betanor-blue)] hover:underline" href={`/workspace/employees/${application.hired_employee_id}`}>Employee profile →</Link> : null}</div>

    <div className="mt-4 flex flex-wrap gap-2"><ApplicantDocumentViewer label="CV / résumé" applicationId={application.id} path={candidate.resume_path} />{candidate.cover_letter_path ? <ApplicantDocumentViewer label="Cover letter" applicationId={application.id} path={candidate.cover_letter_path} /> : null}</div>
    {candidate.cover_letter ? <div className="mt-4 rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold text-[var(--betanor-navy)]">Legacy cover-letter text</p><p className="mt-1 whitespace-pre-line text-sm text-[var(--betanor-text)]">{candidate.cover_letter}</p></div> : null}
    {responsePairs.length ? <dl className="mt-4 grid gap-3 rounded-lg border border-[var(--betanor-border)] bg-white p-3 sm:grid-cols-2">{responsePairs.map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-xs font-semibold text-[var(--betanor-muted)]">{fieldLabels.get(key) ?? key.replaceAll("_", " ")}</dt><dd className="mt-1 break-words text-sm text-[var(--betanor-text)]">{fieldTypes.get(key) === "file_upload" ? typeof value === "string" ? <ApplicantDocumentViewer label={fieldLabels.get(key) ?? "Attachment"} applicationId={application.id} path={value} /> : <span className="text-[var(--betanor-muted)]">Attachment unavailable</span> : Array.isArray(value) ? value.join(", ") : String(value)}</dd></div>)}</dl> : null}

    <details className="mt-4 rounded-xl border border-[var(--betanor-border)] bg-slate-50/70 p-3 sm:p-4">
      <summary className="cursor-pointer font-semibold text-[var(--betanor-navy)]">{evaluationStage === "shortlisting" ? "Evidence-based shortlisting scorecard" : "Structured interview scorecard"}<span className="ml-2 text-xs font-normal text-[var(--betanor-muted)]">{reviewerEntries.length ? `${reviewerEntries.length} reviewer${reviewerEntries.length === 1 ? "" : "s"} · panel ${panelAverage?.toFixed(1)} / 100` : "Not yet evaluated"}</span></summary>
      <div className="mt-3 border-t border-[var(--betanor-border)] pt-3">
        <p className="text-xs leading-5 text-[var(--betanor-muted)]">Rate only job-related, observable evidence using the fixed 0–5 anchors. Cite a specific CV section, answer, work sample, or interview response for every rating; “good fit” or unsupported impressions are not evidence. Threshold: {threshold}%. A minimum-gate criterion below 3 blocks the recommendation. This is decision support, not automatic selection.</p>
        {reviewerEntries.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{reviewerEntries.map((evaluation) => <div key={evaluation.id} className="rounded-lg border border-[var(--betanor-border)] bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-[var(--betanor-navy)]">{reviewerNames.get(evaluation.reviewer_id) || `Reviewer · ${evaluation.reviewer_id.slice(0, 8)}`}{evaluation.reviewer_id === currentUserId ? " · you" : ""}</span><Badge tone={evaluation.recommendation === "meets_threshold" ? "success" : "neutral"}>{evaluation.recommendation.replaceAll("_", " ")}</Badge></div><p className="mt-1 text-sm text-[var(--betanor-muted)]">{Number(evaluation.total_score).toFixed(1)} / 100 · threshold {evaluation.threshold_score}%</p><p className="mt-1 text-[11px] text-[var(--betanor-muted)]">Submitted {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Addis_Ababa" }).format(new Date(evaluation.submitted_at))}</p></div>)}</div> : null}
        {panelAverage !== null ? <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${panelMeetsThreshold ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>Latest independent reviewer average: {panelAverage.toFixed(1)} / 100 · {panelMeetsThreshold ? "meets configured threshold" : "below threshold or a minimum gate needs review"}. The panel should review evidence and document any final decision.</p> : null}
        <form action={submitRecruitmentEvaluation} className="mt-4 space-y-3">
          <input type="hidden" name="applicationId" value={application.id} /><input type="hidden" name="evaluationStage" value={evaluationStage} /><input type="hidden" name="returnTo" value={returnTo} />
          <p className="text-xs font-semibold text-[var(--betanor-navy)]">{ownEvaluation ? "Your latest scores are prefilled; submit a new record to revise them." : "Submit your independent assessment. Each criterion is saved as a dated evaluation record."}</p>
          {rubric.map((criterion, index) => {
            const previous = ownEvaluation?.evaluation_items.find((item) => item.criterion_key === criterion.key);
            return <div key={criterion.key} className="grid gap-3 rounded-lg border border-[var(--betanor-border)] bg-white p-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.8fr)] sm:p-4">
              <div><p className="text-sm font-semibold text-[var(--betanor-navy)]">{index + 1}. {criterion.label}<span className="ml-2 text-xs font-normal text-[var(--betanor-muted)]">{criterion.weight}% weight{criterion.gate ? " · minimum gate" : ""}</span></p><p className="mt-1 text-xs leading-5 text-[var(--betanor-muted)]">{criterion.definition}</p><p className="mt-2 text-xs leading-5 text-[var(--betanor-text)]"><span className="font-semibold">Evidence to collect:</span> {criterion.evidenceGuide}</p>
                <label className="mt-3 block text-xs font-semibold text-[var(--betanor-navy)]" htmlFor={`evidence-${application.id}-${index}`}>Evidence and source <span className="font-normal text-[var(--betanor-muted)]">(minimum 20 characters)</span></label>
                <textarea id={`evidence-${application.id}-${index}`} name={`evidence_${index}`} defaultValue={previous?.evidence ?? ""} required minLength={20} maxLength={1200} rows={3} placeholder="Record specific evidence and where it came from. Avoid unsupported impressions." className="mt-1 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm" />
              </div>
              <div><label className="block text-xs font-semibold text-[var(--betanor-navy)]" htmlFor={`rating-${application.id}-${index}`}>Rating · {criterion.weight}%</label><select id={`rating-${application.id}-${index}`} name={`rating_${index}`} defaultValue={previous?.rating ?? ""} required className="mt-1 min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Choose rating</option>{[0, 1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} · {(["No evidence", "Major gap", "Partial", "Meets requirement", "Strong", "Exceptional"] as const)[rating]}</option>)}</select><ul className="mt-2 space-y-1 text-[11px] leading-4 text-[var(--betanor-muted)]">{["0 · No evidence", "1 · Major gap", "2 · Partial", "3 · Meets requirement", "4 · Strong evidence", "5 · Exceptional verified evidence"].map((anchor) => <li key={anchor}>{anchor}</li>)}</ul></div>
            </div>;
          })}
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-[11px] leading-4 text-[var(--betanor-muted)]">Avoid scoring age, gender, religion, disability, family status, name, accent, or similarity to the panel. Use consistent questions and reasonable accommodations.</p><Button type="submit">Save {evaluationStage === "shortlisting" ? "shortlisting" : "interview"} evaluation</Button></div>
        </form>
      </div>
    </details>

    <form action={reviewApplication} className="mt-4 grid gap-3 border-t border-[var(--betanor-border)] pt-4 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="applicationId" value={application.id} /><input type="hidden" name="returnTo" value={returnTo} />
      <div><FieldLabel htmlFor={`first-${application.id}`}>First name</FieldLabel><Input id={`first-${application.id}`} name="firstName" defaultValue={candidate.first_name ?? ""} maxLength={100} autoComplete="given-name" /></div>
      <div><FieldLabel htmlFor={`last-${application.id}`}>Last name</FieldLabel><Input id={`last-${application.id}`} name="lastName" defaultValue={candidate.last_name ?? ""} maxLength={100} autoComplete="family-name" /></div>
      <div><FieldLabel htmlFor={`stage-${application.id}`}>Pipeline stage</FieldLabel><select id={`stage-${application.id}`} name="stage" defaultValue={application.stage} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm">{stageOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {view === "interviews" ? <><div><FieldLabel htmlFor={`interview-at-${application.id}`}>Interview date & time</FieldLabel><Input id={`interview-at-${application.id}`} name="interviewAt" defaultValue={localInterviewValue(application.interview_at)} type="datetime-local" /><p className="mt-1 text-xs text-[var(--betanor-muted)]">Africa/Addis_Ababa · {interviewLabel(application.interview_at)}</p></div><div><FieldLabel htmlFor={`interview-location-${application.id}`}>Interview location / link</FieldLabel><Input id={`interview-location-${application.id}`} name="interviewLocation" defaultValue={application.interview_location ?? ""} maxLength={500} /></div><div className="sm:col-span-2"><FieldLabel htmlFor={`interview-notes-${application.id}`}>Interview notes</FieldLabel><textarea id={`interview-notes-${application.id}`} name="interviewNotes" defaultValue={application.interview_notes ?? ""} rows={2} maxLength={4000} className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm" /></div></> : null}
      <div className="sm:col-span-2 lg:col-span-3"><FieldLabel htmlFor={`notes-${application.id}`}>Shortlisting / review notes</FieldLabel><textarea id={`notes-${application.id}`} name="notes" defaultValue={application.notes ?? ""} rows={2} maxLength={4000} className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm" /></div>
      <div className="flex items-end"><Button type="submit" className="w-full">{application.stage === "hired" ? "Update employee details" : "Save review / stage"}</Button></div>
    </form>
    {application.stage === "hired" ? <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">This candidate has an employee record in the staff directory. Create or link system login access from Employee management if needed.</p> : null}
  </Card>;
}

export async function RecruitmentWorkspace({ view, searchParams }: { view: View; searchParams: Promise<{ error?: string; saved?: string; template?: string }> }) {
  const supabase = await createClient();
  const [access, params] = await Promise.all([resolveWorkspace(supabase), searchParams]);
  if (!access.workspaceId || !access.hasStaffRole || !access.permissions.has("recruitment.manage")) redirect("/workspace");

  const [{ data: departments }, { data: positions }, { data: openings, error: openingsError }, { data: applications, error: applicationsError }, { data: templates, error: templatesError }] = await Promise.all([
    supabase.from("departments").select("id,name,code").eq("workspace_id", access.workspaceId).order("name"),
    supabase.from("positions").select("id,title,code,department_id").eq("workspace_id", access.workspaceId).order("title"),
    supabase.from("job_openings").select("id,code,title,description,requirements,employment_type,workplace,salary_min,salary_max,opens_on,closes_on,application_instructions,application_form_schema,shortlisting_rubric,interview_rubric,shortlisting_threshold,interview_threshold,department_id,position_id,status,published_at,created_at").eq("workspace_id", access.workspaceId).order("created_at", { ascending: false }).limit(100),
    supabase.from("job_applications").select("id,job_opening_id,candidate_id,stage,applied_at,notes,reviewed_at,interview_at,interview_location,interview_notes,hired_employee_id,form_responses,candidates(id,first_name,last_name,email,phone,education,years_experience,cover_letter,resume_path,cover_letter_path),job_openings!inner(id,title,code,workspace_id,application_form_schema,shortlisting_rubric,interview_rubric,shortlisting_threshold,interview_threshold)").eq("job_openings.workspace_id", access.workspaceId).order("applied_at", { ascending: false }).limit(500),
    supabase.from("job_opening_templates").select("id,name,notes,default_title,department_id,position_id,employment_type,workplace,salary_min,salary_max,description,requirements,application_instructions,application_form_schema,shortlisting_rubric,interview_rubric,shortlisting_threshold,interview_threshold,created_at,updated_at").eq("workspace_id", access.workspaceId).order("name").limit(100),
  ]);
  const templatesList = (templates ?? []) as unknown as VacancyTemplate[];
  const selectedTemplate = params.template ? templatesList.find((template) => template.id === params.template) ?? null : null;
  const openingsList = (openings ?? []) as unknown as VacancyRecord[];
  const allApplications = (applications ?? []) as unknown as RecruitmentApplication[];
  const filteredApplications = view === "shortlisting"
    ? allApplications.filter((application) => ["applied", "screening", "shortlisted"].includes(application.stage))
    : view === "interviews"
      ? allApplications.filter((application) => application.stage === "interview" || Boolean(application.interview_at))
      : [];
  const applicationIds = filteredApplications.map((application) => application.id);
  const { data: evaluationData, error: evaluationsError } = applicationIds.length
    ? await supabase.from("job_application_evaluations")
      .select("id,application_id,stage,reviewer_id,rubric_snapshot,evaluation_items,total_score,threshold_score,recommendation,submitted_at")
      .in("application_id", applicationIds)
      .order("submitted_at", { ascending: false })
      .limit(1500)
    : { data: [], error: null };
  const evaluations = (evaluationData ?? []) as unknown as RecruitmentEvaluation[];
  const evaluationsByApplication = new Map<string, RecruitmentEvaluation[]>();
  for (const evaluation of evaluations) evaluationsByApplication.set(evaluation.application_id, [...(evaluationsByApplication.get(evaluation.application_id) ?? []), evaluation]);
  const reviewerIds = [...new Set(evaluations.map((evaluation) => evaluation.reviewer_id))];
  const { data: reviewerProfiles } = reviewerIds.length
    ? await supabase.from("profiles").select("id,full_name").eq("workspace_id", access.workspaceId).in("id", reviewerIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> };
  const reviewerNames = new Map((reviewerProfiles ?? []).map((reviewer) => [reviewer.id, reviewer.full_name || "Recruitment reviewer"]));
  const route = view === "shortlisting" ? "/workspace/recruitment/shortlisting" : view === "interviews" ? "/workspace/recruitment/interviews" : view === "templates" ? "/workspace/recruitment/templates" : "/workspace/recruitment";
  const activeCount = openingsList.filter((opening) => opening.status === "active").length;
  const draftCount = openingsList.filter((opening) => opening.status === "draft").length;
  const interviewCount = allApplications.filter((application) => application.stage === "interview" || application.interview_at).length;
  const departmentOptions = directoryChoices(departments);
  const positionOptions = positionChoices(positions);

  return <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">People module</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--betanor-navy)] sm:text-3xl">{view === "vacancies" ? "Recruitment desk" : view === "shortlisting" ? "Candidate shortlisting" : view === "interviews" ? "Interview schedule" : "Vacancy templates"}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--betanor-muted)]">Manage vacancy postings and move applicants through a clear, structured hiring pipeline. Applicant email and CV are required; all other information is optional.</p></div><Link href="/careers" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">View public Careers page →</Link></div>
    <ViewTabs current={view} />
    {params.error ? <Card role="alert" className="mt-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{params.error}</Card> : null}
    {params.saved ? <Card role="status" className="mt-4 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{params.saved}</Card> : null}
    {view === "vacancies" ? <><div className="mt-6 grid gap-3 sm:grid-cols-3"><Card className="p-4"><p className="text-xs text-[var(--betanor-muted)]">Active vacancies</p><p className="mt-1 text-2xl font-semibold text-[var(--betanor-navy)]">{activeCount}</p></Card><Card className="p-4"><p className="text-xs text-[var(--betanor-muted)]">Draft vacancies</p><p className="mt-1 text-2xl font-semibold text-[var(--betanor-navy)]">{draftCount}</p></Card><Card className="p-4"><p className="text-xs text-[var(--betanor-muted)]">Interviews scheduled / in progress</p><p className="mt-1 text-2xl font-semibold text-[var(--betanor-navy)]">{interviewCount}</p></Card></div>
      {params.template && !selectedTemplate ? <Card role="alert" className="mt-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">That vacancy template was not found in this workspace. You can start with a blank vacancy or choose another saved template.</Card> : null}
      <details open={Boolean(selectedTemplate)} className="mt-6 rounded-xl border border-[var(--betanor-border)] bg-white p-4 shadow-sm sm:p-5"><summary className="cursor-pointer list-none font-semibold text-[var(--betanor-navy)] marker:hidden">＋ Create vacancy <span className="ml-2 text-xs font-normal text-[var(--betanor-muted)]">Open to configure details and applicant questions</span></summary><div className="mt-4 border-t border-[var(--betanor-border)] pt-4"><VacancyForm key={`new-vacancy-${selectedTemplate?.id ?? "blank"}`} action={saveVacancy} departments={departmentOptions} positions={positionOptions} opening={selectedTemplate ? { ...templateValues(selectedTemplate), id: undefined } : {}} templates={templatesList.map(({ id, name }) => ({ id, name }))} selectedTemplateId={selectedTemplate?.id ?? ""} /></div></details>
      {openingsError ? <Card className="mt-6 p-5 text-sm text-[var(--betanor-danger)]">Vacancies could not be loaded. Check your recruitment access and try again.</Card> : openingsList.length ? <div className="mt-6 space-y-4">{openingsList.map((opening) => {
        const applicantCount = allApplications.filter((application) => application.job_opening_id === opening.id).length;
        const department = (departments ?? []).find((item) => item.id === opening.department_id);
        return <Card key={opening.id} className="p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={opening.status === "active" ? "success" : opening.status === "draft" ? "draft" : "neutral"}>{opening.status}</Badge>{department?.name ? <Badge tone="neutral">{department.name}</Badge> : null}<span className="text-xs text-[var(--betanor-muted)]">{applicantCount} applicant{applicantCount === 1 ? "" : "s"}</span></div><h2 className="mt-2 text-lg font-semibold text-[var(--betanor-navy)]">{opening.title}</h2><p className="mt-1 break-words text-xs text-[var(--betanor-muted)]">{opening.code || "No code"} · {opening.employment_type?.replaceAll("_", " ")} · {opening.workplace || "Location not specified"}</p></div>{opening.status === "active" ? <Link href="/careers" className="shrink-0 text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Public listing ↗</Link> : null}</div>
          <div className="mt-4 flex flex-wrap gap-2"><Link href="/workspace/recruitment/shortlisting" className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-gold)]">Shortlisting queue</Link><Link href="/workspace/recruitment/interviews" className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-gold)]">Interviews</Link></div>
          <details className="mt-4 rounded-lg border border-[var(--betanor-border)] bg-slate-50/60 p-3"><summary className="cursor-pointer text-sm font-semibold text-[var(--betanor-navy)]">Edit vacancy and applicant form</summary><div className="mt-3 border-t border-[var(--betanor-border)] pt-4"><VacancyForm action={saveVacancy} departments={departmentOptions} positions={positionOptions} opening={vacancyValues(opening)} /></div></details>
          <details className="mt-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3"><summary className="cursor-pointer text-sm font-semibold text-rose-800">Delete vacancy</summary><div className="mt-3 border-t border-rose-200 pt-3"><p className="text-sm text-rose-900">This removes the vacancy and its applications. Candidate files are deleted if they are not shared by another application.</p><form action={deleteVacancy} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><input type="hidden" name="openingId" value={opening.id} /><input type="hidden" name="returnTo" value={route} /><label className="inline-flex items-center gap-2 text-sm text-rose-900"><input name="confirmDelete" value="yes" required type="checkbox" /> I understand this cannot be undone</label><Button type="submit" variant="danger" size="sm">Delete vacancy</Button></form></div></details>
        </Card>;
      })}</div> : <Card className="mt-6 p-6"><p className="font-semibold text-[var(--betanor-navy)]">No vacancies created yet.</p><p className="mt-1 text-sm text-[var(--betanor-muted)]">Create a draft or publish the first role above.</p></Card>}</>
      : view === "templates" ? <>
        <details className="mt-6 rounded-xl border border-[var(--betanor-border)] bg-white p-4 shadow-sm sm:p-5"><summary className="cursor-pointer list-none font-semibold text-[var(--betanor-navy)] marker:hidden">＋ Create vacancy template <span className="ml-2 text-xs font-normal text-[var(--betanor-muted)]">Save reusable job details and applicant questions</span></summary><div className="mt-4 border-t border-[var(--betanor-border)] pt-4"><VacancyForm action={saveVacancyTemplate} mode="template" departments={departmentOptions} positions={positionOptions} /></div></details>
        {templatesError ? <Card role="alert" className="mt-4 p-5 text-sm text-[var(--betanor-danger)]">Templates could not be loaded. Check recruitment access and try again.</Card> : templatesList.length ? <div className="mt-6 space-y-4">{templatesList.map((template) => <Card key={template.id} className="p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><h2 className="font-semibold text-[var(--betanor-navy)]">{template.name}</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">{template.default_title || "No default job title"} · {templateQuestionCount(template.application_form_schema)} applicant question(s)</p>{template.notes ? <p className="mt-2 text-sm text-[var(--betanor-text)]">{template.notes}</p> : null}</div><Link href={`/workspace/recruitment?template=${encodeURIComponent(template.id)}`} className="shrink-0 rounded-lg bg-[var(--betanor-navy)] px-3 py-2 text-center text-xs font-semibold text-white hover:bg-[var(--betanor-blue)]">Use for a vacancy</Link></div><details className="mt-4 rounded-lg border border-[var(--betanor-border)] bg-slate-50/60 p-3"><summary className="cursor-pointer text-sm font-semibold text-[var(--betanor-navy)]">Edit template</summary><div className="mt-3 border-t border-[var(--betanor-border)] pt-4"><VacancyForm key={`${template.id}-${template.updated_at}`} action={saveVacancyTemplate} mode="template" departments={departmentOptions} positions={positionOptions} opening={templateValues(template)} /></div></details><details className="mt-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3"><summary className="cursor-pointer text-sm font-semibold text-rose-800">Delete template</summary><div className="mt-3 border-t border-rose-200 pt-3"><p className="text-sm text-rose-900">Deleting a template does not change vacancies already created from it.</p><form action={deleteVacancyTemplate} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><input type="hidden" name="templateId" value={template.id} /><label className="inline-flex items-center gap-2 text-sm text-rose-900"><input name="confirmDelete" value="yes" required type="checkbox" /> I understand this cannot be undone</label><Button type="submit" variant="danger" size="sm">Delete template</Button></form></div></details></Card>)}</div> : <Card className="mt-6 p-6"><p className="font-semibold text-[var(--betanor-navy)]">No vacancy templates yet.</p><p className="mt-1 text-sm text-[var(--betanor-muted)]">Create one to reuse its role description, requirements, and applicant questions.</p></Card>}
      </>
      : <><div className="mt-6 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-[var(--betanor-muted)]">{filteredApplications.length} applicant{filteredApplications.length === 1 ? "" : "s"} in this queue · newest first</p><Link href="/workspace/recruitment" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Manage vacancies →</Link></div>{applicationsError ? <Card className="mt-4 p-5 text-sm text-[var(--betanor-danger)]">Applicant records could not be loaded.</Card> : evaluationsError ? <Card role="alert" className="mt-4 border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">Recruitment scorecards are not available because the database migration is not installed. Do not deploy this version until the included recruitment scoring migration is applied.</Card> : filteredApplications.length ? <div className="mt-4 space-y-4">{filteredApplications.map((application) => <ApplicantCard key={application.id} application={application} view={view} evaluations={evaluationsByApplication.get(application.id) ?? []} reviewerNames={reviewerNames} currentUserId={access.userId ?? ""} />)}</div> : <Card className="mt-4 p-6"><p className="font-semibold text-[var(--betanor-navy)]">{view === "shortlisting" ? "No candidates are waiting for shortlisting." : "No interviews are scheduled yet."}</p><p className="mt-1 text-sm text-[var(--betanor-muted)]">{view === "shortlisting" ? "New applications will appear here for HR review." : "Move a shortlisted candidate to Interview and add a date, time, and location."}</p></Card>}</>}
  </main>;
}
