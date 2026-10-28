export type RecruitmentStage = "shortlisting" | "interview";

export type RecruitmentCriterion = {
  key: string;
  label: string;
  definition: string;
  evidenceGuide: string;
  weight: number;
  gate: boolean;
};

export type RecruitmentEvaluationItem = {
  criterion_key: string;
  rating: number;
  evidence: string;
};

export const SCORE_ANCHORS = [
  { score: 0, label: "No evidence", description: "No relevant evidence or response was provided." },
  { score: 1, label: "Major gap", description: "Evidence is inaccurate, unsupported, or well below the stated requirement." },
  { score: 2, label: "Partial", description: "Some relevant evidence, but material gaps remain; substantial support would be needed." },
  { score: 3, label: "Meets requirement", description: "Accurate, relevant evidence demonstrates the published minimum requirement." },
  { score: 4, label: "Strong", description: "Specific, verifiable evidence demonstrates independent performance above the requirement." },
  { score: 5, label: "Exceptional", description: "Multiple verifiable examples show depth, measurable impact, and effective handling of complexity." },
] as const;

export const DEFAULT_SHORTLIST_RUBRIC: RecruitmentCriterion[] = [
  { key: "essential_eligibility", label: "Essential eligibility and credentials", definition: "Evidence for qualifications, licences, and other essential requirements explicitly stated in this vacancy.", evidenceGuide: "Map each published essential requirement to the CV or application; note the section, credential, or answer that supports the rating.", weight: 25, gate: true },
  { key: "relevant_experience", label: "Relevant experience and scope", definition: "Comparable work, responsibility level, context, and recency relevant to the advertised duties.", evidenceGuide: "Record the role, dates, scope, and specific duties or outcomes that match the published requirements.", weight: 25, gate: false },
  { key: "role_capability", label: "Role-specific capability evidence", definition: "Demonstrated skills and capabilities explicitly required for this role, not general impressions.", evidenceGuide: "Cite a work sample, project, credential, or application response that demonstrates each rated capability.", weight: 35, gate: true },
  { key: "evidence_of_outcomes", label: "Evidence of relevant outcomes", definition: "Specific, attributable results or deliverables that are relevant to the role.", evidenceGuide: "Note a result, deliverable, or impact stated by the candidate and where it appears in the application.", weight: 15, gate: false },
];

export const DEFAULT_INTERVIEW_RUBRIC: RecruitmentCriterion[] = [
  { key: "role_knowledge", label: "Role knowledge and practical judgment", definition: "Accuracy and application of knowledge required by the published role requirements.", evidenceGuide: "Ask the same pre-agreed job-knowledge questions of every candidate; record the answer and relevant technical facts.", weight: 30, gate: true },
  { key: "problem_solving", label: "Applied problem-solving", definition: "Structured analysis, safe decisions, and workable actions in a role-relevant scenario.", evidenceGuide: "Use the same role-related scenario and time limit; record the steps, trade-offs, and result in the answer.", weight: 30, gate: true },
  { key: "behavioral_evidence", label: "Behavioral evidence and results", definition: "Specific past actions and outcomes that demonstrate the competencies required for the role.", evidenceGuide: "Use the same competency-based prompt; capture the candidate's situation, action, and attributable result.", weight: 25, gate: false },
  { key: "job_communication", label: "Job-relevant communication and collaboration", definition: "Ability to exchange accurate, understandable information needed for this role; do not rate accent, style, or personality similarity.", evidenceGuide: "Record a concrete example from the structured interview or job exercise showing role-relevant listening, explanation, or handover.", weight: 15, gate: false },
];

export function defaultRecruitmentRubric(stage: RecruitmentStage) {
  return stage === "shortlisting" ? DEFAULT_SHORTLIST_RUBRIC : DEFAULT_INTERVIEW_RUBRIC;
}

export function parseRecruitmentRubric(value: unknown, stage: RecruitmentStage): RecruitmentCriterion[] {
  const fallback = defaultRecruitmentRubric(stage);
  let raw = value;
  if (typeof value === "string") {
    if (value.length > 16000) throw new Error("The recruitment rubric is too large.");
    try { raw = JSON.parse(value); } catch { throw new Error("The recruitment rubric is not valid JSON."); }
  }
  if (raw === null || raw === undefined || raw === "") return fallback;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 8) throw new Error("Each scoring stage must have between 2 and 8 criteria.");

  const keys = new Set<string>();
  const rubric = raw.map((item, index): RecruitmentCriterion => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Scoring criterion ${index + 1} is invalid.`);
    const row = item as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const definition = typeof row.definition === "string" ? row.definition.trim() : "";
    const evidenceGuide = typeof row.evidenceGuide === "string" ? row.evidenceGuide.trim() : "";
    const weight = Number(row.weight);
    if (!/^[a-z][a-z0-9_-]{1,39}$/.test(key) || keys.has(key)) throw new Error(`Scoring criterion ${index + 1} needs a unique valid identifier.`);
    if (!label || label.length > 120 || !definition || definition.length > 360 || !evidenceGuide || evidenceGuide.length > 500) throw new Error(`Complete the title, job-related definition, and evidence guide for criterion ${index + 1}.`);
    if (!Number.isInteger(weight) || weight < 1 || weight > 100) throw new Error(`Criterion ${index + 1} weight must be a whole number from 1 to 100.`);
    if (typeof row.gate !== "boolean") throw new Error(`Set whether criterion ${index + 1} is a minimum requirement.`);
    keys.add(key);
    return { key, label, definition, evidenceGuide, weight, gate: row.gate };
  });
  if (rubric.reduce((sum, criterion) => sum + criterion.weight, 0) !== 100) throw new Error("The criteria weights for each stage must total exactly 100%.");
  return rubric;
}

export function parseRecruitmentThreshold(value: unknown, fieldName: string) {
  const threshold = value === null || value === undefined || value === "" ? 70 : Number(value);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) throw new Error(`${fieldName} must be a whole number from 0 to 100.`);
  return threshold;
}

export function calculateRecruitmentScore(rubric: RecruitmentCriterion[], items: RecruitmentEvaluationItem[]) {
  if (rubric.length !== items.length) throw new Error("Score every criterion before submitting the evaluation.");
  const itemByKey = new Map(items.map((item) => [item.criterion_key, item]));
  let total = 0;
  const unmetGates: string[] = [];
  for (const criterion of rubric) {
    const item = itemByKey.get(criterion.key);
    if (!item || !Number.isInteger(item.rating) || item.rating < 0 || item.rating > 5) throw new Error(`Choose a 0–5 rating for “${criterion.label}”.`);
    if (item.evidence.trim().length < 20) throw new Error(`Add specific evidence of at least 20 characters for “${criterion.label}”.`);
    total += (item.rating / 5) * criterion.weight;
    if (criterion.gate && item.rating < 3) unmetGates.push(criterion.label);
  }
  return { total: Math.round(total * 100) / 100, unmetGates };
}

export function recruitmentPanelResult<T extends {
  reviewer_id: string;
  total_score: number;
  submitted_at: string;
  evaluation_items: Array<Pick<RecruitmentEvaluationItem, "criterion_key" | "rating">>;
}>(rubric: RecruitmentCriterion[], evaluations: T[], threshold: number) {
  const latestByReviewer = new Map<string, T>();
  for (const evaluation of [...evaluations].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))) {
    if (!latestByReviewer.has(evaluation.reviewer_id)) latestByReviewer.set(evaluation.reviewer_id, evaluation);
  }
  const latest = [...latestByReviewer.values()];
  const score = latest.length ? latest.reduce((sum, evaluation) => sum + Number(evaluation.total_score), 0) / latest.length : null;
  const unmetGates = rubric.filter((criterion) => criterion.gate && (
    latest.length === 0 || latest.reduce((sum, evaluation) => {
      const rating = evaluation.evaluation_items.find((item) => item.criterion_key === criterion.key)?.rating;
      return sum + (typeof rating === "number" && Number.isFinite(rating) ? rating : 0);
    }, 0) / latest.length < 3
  )).map((criterion) => criterion.label);
  const meetsThreshold = score !== null && score >= threshold && unmetGates.length === 0;
  return {
    latest,
    score,
    unmetGates,
    meetsThreshold,
    recommendation: latest.length === 0 ? "not_evaluated" as const : unmetGates.length ? "gate_not_met" as const : meetsThreshold ? "meets_threshold" as const : "below_threshold" as const,
  };
}
