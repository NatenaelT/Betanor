import { redirect } from "next/navigation";

import { ContentCard, ContentGrid } from "@/components/public/content-grid";
import { PageHero } from "@/components/public/page-hero";
import { PublicHeader } from "@/components/navigation/public-header";
import { SiteFooter } from "@/components/navigation/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function applyToJob(data: FormData) {
  "use server";
  const jobOpeningId = String(data.get("jobOpeningId") ?? "");
  if (!jobOpeningId) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_public_job_application", {
    job_opening_id_input: jobOpeningId,
    first_name_input: String(data.get("firstName") ?? "").trim(),
    last_name_input: String(data.get("lastName") ?? "").trim(),
    email_input: String(data.get("email") ?? "").trim(),
    phone_input: String(data.get("phone") ?? "").trim(),
    education_input: String(data.get("education") ?? "").trim(),
    years_experience_input: Number(data.get("yearsExperience") ?? 0) || null,
    cover_letter_input: String(data.get("coverLetter") ?? "").trim(),
    resume_path_input: String(data.get("resumeUrl") ?? "").trim() || null,
  });
  if (error) redirect("/careers?error=application");
  redirect("/careers?submitted=1");
}

function salaryRange(min: number | null, max: number | null) {
  if (!min && !max) return "Salary discussed during the process";
  if (min && max) return `ETB ${min.toLocaleString()} – ${max.toLocaleString()} monthly`;
  return `From ETB ${(min ?? max)?.toLocaleString()} monthly`;
}

export default async function CareersPage({ searchParams }: { searchParams: Promise<{ submitted?: string; error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: jobs, error: jobsError } = await supabase.from("job_openings").select("id,code,title,description,requirements,employment_type,workplace,salary_min,salary_max,opens_on,closes_on,application_instructions,departments(name)").eq("status", "active").order("created_at", { ascending: false });

  return <><PublicHeader /><main><PageHero eyebrow="Careers" title="Build dependable technology with a team that values craft.">We welcome people who care about clear communication, reliable delivery, practical problem solving, and strengthening the organizations we serve.</PageHero>{params.submitted ? <div className="mx-auto mt-8 max-w-7xl px-6 lg:px-8"><div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">Your application has been received. Our HR team will review it and contact you if your experience matches the role.</div></div> : null}{params.error ? <div className="mx-auto mt-8 max-w-7xl px-6 lg:px-8"><div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">We could not submit that application. Please review the required fields and try again.</div></div> : null}<ContentGrid><ContentCard title="Meaningful delivery">Contribute to projects that improve the way organizations operate.</ContentCard><ContentCard title="Learn continuously">Grow through complex, cross-disciplinary technology work and capacity building.</ContentCard><ContentCard title="Work with accountability">We value clear communication, durable solutions, and respect for our clients’ operations.</ContentCard></ContentGrid><section className="mx-auto max-w-7xl px-6 pb-16 lg:px-8"><div className="max-w-2xl"><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Open roles</p><h2 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">Find your next meaningful assignment.</h2><p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">Roles published by Betanor HR appear here with the location, schedule, compensation range, and application requirements that apply to that vacancy.</p></div>{jobsError ? <Card className="mt-8 p-6 text-sm text-[var(--betanor-danger)]">Open roles are temporarily unavailable. Please check back shortly.</Card> : jobs?.length ? <div className="mt-8 space-y-6">{jobs.map((job) => <Card key={job.id} className="p-6 md:p-8"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><Badge tone="info">{job.employment_type.replaceAll("_", " ")}</Badge><Badge tone="neutral">{job.workplace}</Badge>{job.departments?.[0]?.name ? <Badge tone="neutral">{job.departments[0].name}</Badge> : null}</div><h3 className="mt-4 text-2xl font-semibold text-[var(--betanor-navy)]">{job.title}</h3><p className="mt-2 text-sm text-[var(--betanor-muted)]">{salaryRange(job.salary_min, job.salary_max)} · Apply by {job.closes_on ?? "rolling review"}</p></div>{job.code ? <span className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)]">{job.code}</span> : null}</div><div className="mt-6 grid gap-6 lg:grid-cols-2"><div className="space-y-5 text-sm leading-6 text-[var(--betanor-text)]"><div><h4 className="font-semibold text-[var(--betanor-navy)]">Role overview</h4><p className="mt-2 whitespace-pre-line">{job.description || "Betanor HR will share the role scope during the application review."}</p></div><div><h4 className="font-semibold text-[var(--betanor-navy)]">Requirements</h4><p className="mt-2 whitespace-pre-line">{job.requirements || "Relevant experience, clear communication, and a commitment to reliable delivery."}</p></div>{job.application_instructions ? <div><h4 className="font-semibold text-[var(--betanor-navy)]">Application instructions</h4><p className="mt-2 whitespace-pre-line">{job.application_instructions}</p></div> : null}</div><form action={applyToJob} className="rounded-xl bg-slate-50 p-5"><input type="hidden" name="jobOpeningId" value={job.id}/><h4 className="font-semibold text-[var(--betanor-navy)]">Apply for this role</h4><p className="mt-1 text-xs leading-5 text-[var(--betanor-muted)]">HR reviews every application. Please provide accurate information; a cover letter is required.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><FieldLabel htmlFor={`first-${job.id}`}>First name</FieldLabel><Input id={`first-${job.id}`} name="firstName" required/></div><div><FieldLabel htmlFor={`last-${job.id}`}>Last name</FieldLabel><Input id={`last-${job.id}`} name="lastName" required/></div><div><FieldLabel htmlFor={`email-${job.id}`}>Email</FieldLabel><Input id={`email-${job.id}`} name="email" required type="email"/></div><div><FieldLabel htmlFor={`phone-${job.id}`}>Phone</FieldLabel><Input id={`phone-${job.id}`} name="phone" type="tel"/></div><div><FieldLabel htmlFor={`education-${job.id}`}>Education / certification</FieldLabel><Input id={`education-${job.id}`} name="education"/></div><div><FieldLabel htmlFor={`years-${job.id}`}>Years of experience</FieldLabel><Input id={`years-${job.id}`} min="0" name="yearsExperience" step="0.5" type="number"/></div></div><div className="mt-3"><FieldLabel htmlFor={`resume-${job.id}`}>CV or portfolio link</FieldLabel><Input id={`resume-${job.id}`} name="resumeUrl" type="url"/></div><div className="mt-3"><FieldLabel htmlFor={`cover-${job.id}`}>Cover letter</FieldLabel><textarea id={`cover-${job.id}`} name="coverLetter" required rows={5} className="w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm"/></div><Button type="submit" className="mt-4 w-full">Submit application</Button></form></div></Card>)}</div> : <Card className="mt-8 p-8"><p className="font-semibold text-[var(--betanor-navy)]">There are no open roles right now.</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">Betanor HR updates this page when a new vacancy is approved.</p></Card>}</section></main><SiteFooter /></>;
}
