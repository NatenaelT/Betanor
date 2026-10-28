"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseApplicationFormSchema } from "@/lib/recruitment/forms";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

const statusValues = new Set(["draft", "active", "inactive", "archived"]);
const employmentTypes = new Set(["full_time", "part_time", "contract", "internship"]);
const stages = new Set(["applied", "screening", "shortlisted", "interview", "offered", "hired", "rejected"]);
const routes = new Set(["/workspace/recruitment", "/workspace/recruitment/shortlisting", "/workspace/recruitment/interviews", "/workspace/recruitment/templates"]);

type CandidateDocument = { id: string; resume_path: string | null; cover_letter_path: string | null };
type OpeningApplication = { candidate_id: string; form_responses: Record<string, unknown> | null; candidates: CandidateDocument | CandidateDocument[] | null };
type VacancyDeleteRecord = { job_applications: OpeningApplication[] | null };
type ApplicationReference = { candidate_id: string; job_opening_id: string };
type ApplicationForReview = { id: string; candidate_id: string; job_openings: { workspace_id: string } | { workspace_id: string }[] | null };

function clean(value: FormDataEntryValue | null, limit = 10000) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function destination(data: FormData) {
  const route = clean(data.get("returnTo"), 80);
  return routes.has(route) ? route : "/workspace/recruitment";
}

function messagePath(route: string, key: "error" | "saved", message: string) {
  return `${route}?${key}=${encodeURIComponent(message.slice(0, 220))}`;
}

async function requireRecruitmentAccess() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.workspaceId || !access.hasStaffRole || !access.permissions.has("recruitment.manage")) {
    return { supabase, workspaceId: null, userId: null };
  }
  return { supabase, workspaceId: access.workspaceId, userId: access.userId };
}

function parseDate(value: string, field: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${field} is not a valid date.`);
  return value;
}

function parseAmount(value: string, field: string) {
  if (!value) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${field} must be zero or more.`);
  return amount;
}

async function parsePostingFields(data: FormData, workspaceId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const employmentType = clean(data.get("employmentType"), 30) || "full_time";
  if (!employmentTypes.has(employmentType)) throw new Error("Choose a valid employment type.");
  const salaryMin = parseAmount(clean(data.get("salaryMin"), 30), "Minimum salary");
  const salaryMax = parseAmount(clean(data.get("salaryMax"), 30), "Maximum salary");
  if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) throw new Error("Maximum salary must be at least the minimum salary.");
  const departmentId = clean(data.get("departmentId"), 80) || null;
  const positionId = clean(data.get("positionId"), 80) || null;
  if (departmentId) {
    const { data: department } = await supabase.from("departments").select("id").eq("id", departmentId).eq("workspace_id", workspaceId).maybeSingle();
    if (!department) throw new Error("Choose a department in this workspace.");
  }
  if (positionId) {
    const { data: position } = await supabase.from("positions").select("id,department_id").eq("id", positionId).eq("workspace_id", workspaceId).maybeSingle();
    if (!position || (departmentId && position.department_id && position.department_id !== departmentId)) throw new Error("Choose a position that belongs to the selected department.");
  }
  return {
    department_id: departmentId,
    position_id: positionId,
    employment_type: employmentType,
    workplace: clean(data.get("workplace"), 120) || "Not specified",
    salary_min: salaryMin,
    salary_max: salaryMax,
    description: clean(data.get("description")) || null,
    requirements: clean(data.get("requirements")) || null,
    application_instructions: clean(data.get("instructions"), 5000) || null,
    application_form_schema: parseApplicationFormSchema(data.get("applicationFormSchema")),
  };
}

export async function saveVacancy(data: FormData) {
  const route = destination(data);
  const { supabase, workspaceId } = await requireRecruitmentAccess();
  if (!workspaceId) redirect("/workspace");

  try {
    const title = clean(data.get("title"), 180);
    if (!title) throw new Error("Vacancy title is required.");
    const status = clean(data.get("status"), 20) || "draft";
    const employmentType = clean(data.get("employmentType"), 30) || "full_time";
    if (!statusValues.has(status)) throw new Error("Choose a valid vacancy status.");
    if (!employmentTypes.has(employmentType)) throw new Error("Choose a valid employment type.");
    const opensOn = parseDate(clean(data.get("opensOn"), 10), "Opening date");
    const closesOn = parseDate(clean(data.get("closesOn"), 10), "Application deadline");
    if (opensOn && closesOn && closesOn < opensOn) throw new Error("Application deadline must be on or after the opening date.");
    const shared = await parsePostingFields(data, workspaceId, supabase);
    const openingId = clean(data.get("openingId"), 80);
    const suppliedCode = clean(data.get("code"), 50);
    let existingOpening: { code: string | null; published_at: string | null } | null = null;
    if (openingId) {
      const { data: currentOpening, error } = await supabase.from("job_openings").select("code,published_at").eq("id", openingId).eq("workspace_id", workspaceId).maybeSingle();
      if (error || !currentOpening) throw new Error("Vacancy not found or you do not have permission to update it.");
      existingOpening = currentOpening;
    }
    const openingCode = suppliedCode || existingOpening?.code || `BTNR-JOB-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
    const values = {
      ...shared,
      title,
      code: openingCode,
      opens_on: opensOn,
      closes_on: closesOn,
      status,
      published_at: status === "active" ? existingOpening?.published_at || new Date().toISOString() : null,
    };
    const query = openingId
      ? supabase.from("job_openings").update(values).eq("id", openingId).eq("workspace_id", workspaceId)
      : supabase.from("job_openings").insert({ ...values, workspace_id: workspaceId });
    const { error } = await query;
    if (error) throw new Error(error.message);
  } catch (error) {
    redirect(messagePath(route, "error", error instanceof Error ? error.message : "Vacancy could not be saved."));
  }

  revalidatePath("/workspace/recruitment");
  revalidatePath("/workspace/recruitment/shortlisting");
  revalidatePath("/workspace/recruitment/interviews");
  revalidatePath("/workspace/recruitment/templates");
  revalidatePath("/careers");
  redirect(messagePath(route, "saved", "Vacancy saved."));
}

export async function saveVacancyTemplate(data: FormData) {
  const route = "/workspace/recruitment/templates";
  const { supabase, workspaceId, userId } = await requireRecruitmentAccess();
  if (!workspaceId || !userId) redirect("/workspace");
  try {
    const name = clean(data.get("templateName"), 120);
    if (!name) throw new Error("Template name is required.");
    const templateId = clean(data.get("templateId"), 80);
    const title = clean(data.get("title"), 180) || null;
    const values = {
      ...await parsePostingFields(data, workspaceId, supabase),
      name,
      notes: clean(data.get("templateDescription"), 500) || null,
      default_title: title,
      updated_at: new Date().toISOString(),
    };
    const query = templateId
      ? supabase.from("job_opening_templates").update(values).eq("id", templateId).eq("workspace_id", workspaceId)
      : supabase.from("job_opening_templates").insert({ ...values, workspace_id: workspaceId, created_by: userId });
    const { data: saved, error } = await query.select("id").maybeSingle();
    if (error) throw new Error(error.code === "23505" ? "A template with that name already exists." : error.message);
    if (!saved) throw new Error("Template not found or you do not have permission to edit it.");
  } catch (error) {
    redirect(messagePath(route, "error", error instanceof Error ? error.message : "Template could not be saved."));
  }
  revalidatePath(route);
  revalidatePath("/workspace/recruitment");
  redirect(messagePath(route, "saved", "Vacancy template saved."));
}

export async function deleteVacancyTemplate(data: FormData) {
  const route = "/workspace/recruitment/templates";
  const templateId = clean(data.get("templateId"), 80);
  const { supabase, workspaceId } = await requireRecruitmentAccess();
  if (!workspaceId) redirect("/workspace");
  if (!templateId || clean(data.get("confirmDelete"), 10) !== "yes") redirect(messagePath(route, "error", "Confirm the template deletion before continuing."));
  const { data: deleted, error } = await supabase.from("job_opening_templates").delete().eq("id", templateId).eq("workspace_id", workspaceId).select("id").maybeSingle();
  if (error) redirect(messagePath(route, "error", error.message));
  if (!deleted) redirect(messagePath(route, "error", "Template not found or you do not have permission to delete it."));
  revalidatePath(route);
  redirect(messagePath(route, "saved", "Vacancy template deleted."));
}

export async function deleteVacancy(data: FormData) {
  const route = destination(data);
  const openingId = clean(data.get("openingId"), 80);
  const { supabase, workspaceId } = await requireRecruitmentAccess();
  if (!workspaceId) redirect("/workspace");
  if (!openingId || clean(data.get("confirmDelete"), 10) !== "yes") redirect(messagePath(route, "error", "Confirm the vacancy deletion in the page before continuing."));

  const { data: openingData, error: readError } = await supabase.from("job_openings")
    .select("id,job_applications(candidate_id,form_responses,candidates(id,resume_path,cover_letter_path))")
    .eq("id", openingId).eq("workspace_id", workspaceId).maybeSingle();
  const opening = openingData as unknown as VacancyDeleteRecord | null;
  if (readError || !opening) redirect(messagePath(route, "error", "Vacancy not found or you do not have permission to delete it."));

  const applicants = (opening.job_applications ?? []).flatMap((application) => {
    const candidate = Array.isArray(application.candidates) ? application.candidates[0] : application.candidates;
    return candidate ? [candidate] : [];
  });
  const candidateIds = [...new Set<string>(applicants.map((candidate) => candidate.id).filter((id: unknown): id is string => typeof id === "string"))];
  const { data: remainingApplications, error: applicationLookupError } = candidateIds.length
    ? await supabase.from("job_applications").select("candidate_id,job_opening_id").in("candidate_id", candidateIds)
    : { data: [], error: null };
  if (applicationLookupError) redirect(messagePath(route, "error", "Related applicant records could not be checked safely. Vacancy was kept; retry."));
  const applicationReferences = (remainingApplications ?? []) as ApplicationReference[];
  const linkedElsewhere = new Set(applicationReferences.filter((application) => application.job_opening_id !== openingId).map((application) => application.candidate_id));
  const filePaths = [
    ...applicants.filter((candidate) => !linkedElsewhere.has(candidate.id)).flatMap((candidate) => [candidate.resume_path, candidate.cover_letter_path]),
    ...(opening.job_applications ?? []).flatMap((application) => Object.values(application.form_responses ?? {})),
  ].filter((path: unknown): path is string => typeof path === "string" && path.startsWith("intake/"));
  const paths = [...new Set<string>(filePaths)];
  if (paths.length) {
    const { error } = await supabase.storage.from("betanor-candidate-documents").remove(paths);
    if (error) redirect(messagePath(route, "error", "Applicant files could not be removed safely. The vacancy was kept; please retry."));
  }

  const { error: deleteError } = await supabase.from("job_openings").delete().eq("id", openingId).eq("workspace_id", workspaceId);
  if (deleteError) redirect(messagePath(route, "error", deleteError.message));

  if (candidateIds.length) {
    const orphanedIds = candidateIds.filter((candidateId) => !linkedElsewhere.has(candidateId));
    if (orphanedIds.length) await supabase.from("candidates").delete().in("id", orphanedIds).eq("workspace_id", workspaceId);
  }

  revalidatePath("/workspace/recruitment");
  revalidatePath("/workspace/recruitment/shortlisting");
  revalidatePath("/workspace/recruitment/interviews");
  revalidatePath("/careers");
  redirect(messagePath(route, "saved", "Vacancy deleted."));
}

export async function reviewApplication(data: FormData) {
  const route = destination(data);
  const applicationId = clean(data.get("applicationId"), 80);
  const stage = clean(data.get("stage"), 30);
  const { supabase, workspaceId } = await requireRecruitmentAccess();
  if (!workspaceId) redirect("/workspace");
  if (!applicationId || !stages.has(stage)) redirect(messagePath(route, "error", "Choose a valid application stage."));

  const { data: applicationData, error: applicationError } = await supabase.from("job_applications")
    .select("id,candidate_id,job_openings!inner(workspace_id)").eq("id", applicationId).maybeSingle();
  const application = applicationData as unknown as ApplicationForReview | null;
  const opening = Array.isArray(application?.job_openings) ? application.job_openings[0] : application?.job_openings;
  if (applicationError || !application || opening?.workspace_id !== workspaceId) redirect(messagePath(route, "error", "Application not found or access denied."));

  const firstName = clean(data.get("firstName"), 100);
  const lastName = clean(data.get("lastName"), 100);
  const { error: candidateError } = await supabase.from("candidates").update({ first_name: firstName || null, last_name: lastName || null })
    .eq("id", application.candidate_id).eq("workspace_id", workspaceId);
  if (candidateError) redirect(messagePath(route, "error", candidateError.message));

  const interviewLocal = clean(data.get("interviewAt"), 30);
  let interviewAt: string | null = null;
  if (interviewLocal) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(interviewLocal)) redirect(messagePath(route, "error", "Enter a valid interview date and time."));
    const parsedInterview = new Date(`${interviewLocal}:00+03:00`);
    if (Number.isNaN(parsedInterview.valueOf())) redirect(messagePath(route, "error", "Enter a valid interview date and time."));
    interviewAt = parsedInterview.toISOString();
  }
  const scoreValue = clean(data.get("score"), 12);
  const score = scoreValue ? Number(scoreValue) : null;
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) redirect(messagePath(route, "error", "Review score must be between 0 and 100."));
  const { error } = await supabase.from("job_applications").update({
    stage,
    score,
    notes: clean(data.get("notes"), 4000) || null,
    interview_at: interviewAt,
    interview_location: clean(data.get("interviewLocation"), 500) || null,
    interview_notes: clean(data.get("interviewNotes"), 4000) || null,
    reviewed_by: workspaceId ? (await resolveWorkspace(supabase)).userId : null,
    reviewed_at: new Date().toISOString(),
  }).eq("id", applicationId);
  if (error) redirect(messagePath(route, "error", error.message));

  revalidatePath("/workspace/recruitment");
  revalidatePath("/workspace/recruitment/shortlisting");
  revalidatePath("/workspace/recruitment/interviews");
  revalidatePath("/workspace/employees");
  redirect(messagePath(route, "saved", stage === "hired" ? "Candidate hired and added to the employee directory." : "Application review saved."));
}
