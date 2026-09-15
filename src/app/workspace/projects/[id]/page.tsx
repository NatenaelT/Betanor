import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function addMilestone(data: FormData) {
  "use server";
  const projectId = String(data.get("projectId") ?? "");
  const title = String(data.get("title") ?? "").trim();
  if (!projectId || !title) return;
  const supabase = await createClient();
  await supabase.from("milestones").insert({ project_id: projectId, title, description: String(data.get("description") ?? "").trim() || null, due_on: String(data.get("dueOn") ?? "") || null });
  revalidatePath(`/workspace/projects/${projectId}`);
  revalidatePath("/workspace/tasks");
}

async function updateMilestone(data: FormData) {
  "use server";
  const projectId = String(data.get("projectId") ?? "");
  const milestoneId = String(data.get("milestoneId") ?? "");
  if (!projectId || !milestoneId) return;
  await (await createClient()).from("milestones").update({ status: String(data.get("status") ?? "not_started") }).eq("id", milestoneId);
  revalidatePath(`/workspace/projects/${projectId}`);
}

function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function tone(status: string) { return status === "completed" ? "success" as const : status === "blocked" ? "danger" as const : status === "in_progress" ? "info" as const : "draft" as const; }

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: project, error } = await supabase.from("projects").select("id,project_code,name,status,description,starts_on,ends_on,budget_amount,currency_code,customers(name),contracts(title),milestones(id,title,description,due_on,status),tasks(id,title,status,priority,due_on,milestone_id)").eq("id", id).maybeSingle();
  if (error || !project) notFound();
  const milestones = project.milestones ?? [];
  const tasks = project.tasks ?? [];

  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8"><Link href="/workspace/projects" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">← Back to projects</Link><div className="mt-5 flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={tone(project.status)}>{titleCase(project.status)}</Badge><span className="text-xs text-[var(--betanor-muted)]">{project.project_code}</span></div><h1 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">{project.name}</h1><p className="mt-2 text-sm text-[var(--betanor-muted)]">{project.customers?.[0]?.name || "Internal delivery"}{project.contracts?.[0] ? ` · Contract: ${project.contracts[0].title}` : ""}</p></div><Link href="/workspace/tasks" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">View work queue →</Link></div><div className="mt-8 grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><Card className="p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Project brief</h2><p className="mt-3 text-sm leading-6 text-[var(--betanor-text)]">{project.description || "No project brief has been recorded yet."}</p><dl className="mt-6 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-[var(--betanor-muted)]">Delivery window</dt><dd className="mt-1 font-semibold text-[var(--betanor-navy)]">{project.starts_on || "—"} → {project.ends_on || "—"}</dd></div><div><dt className="text-xs text-[var(--betanor-muted)]">Budget</dt><dd className="mt-1 font-semibold text-[var(--betanor-navy)]">{project.budget_amount ? `${project.currency_code} ${project.budget_amount}` : "To be confirmed"}</dd></div></dl><div className="mt-8 border-t border-[var(--betanor-border)] pt-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Add implementation milestone</h2><form action={addMilestone} className="mt-4 space-y-3"><input type="hidden" name="projectId" value={project.id}/><div><FieldLabel htmlFor="milestone-title">Milestone</FieldLabel><Input id="milestone-title" name="title" required placeholder="e.g. Site acceptance and handover"/></div><div><FieldLabel htmlFor="milestone-due">Due on</FieldLabel><Input id="milestone-due" name="dueOn" type="date"/></div><textarea name="description" rows={2} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder="Acceptance criteria"/><Button type="submit" size="sm">Add milestone</Button></form></div></Card><div className="space-y-6"><Card className="p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Milestones</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">{milestones.length} milestone{milestones.length === 1 ? "" : "s"}</p></div></div>{milestones.length ? <div className="mt-4 space-y-3">{milestones.map((milestone) => <div key={milestone.id} className="rounded-lg border border-[var(--betanor-border)] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[var(--betanor-navy)]">{milestone.title}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Due {milestone.due_on || "not scheduled"}</p></div><Badge tone={tone(milestone.status)}>{titleCase(milestone.status)}</Badge></div>{milestone.description ? <p className="mt-3 text-sm text-[var(--betanor-text)]">{milestone.description}</p> : null}<form action={updateMilestone} className="mt-3 flex gap-2"><input type="hidden" name="projectId" value={project.id}/><input type="hidden" name="milestoneId" value={milestone.id}/><select name="status" defaultValue={milestone.status} className="min-h-8 rounded-lg border border-[var(--betanor-border)] bg-white px-2 text-xs"><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select><Button type="submit" size="sm" variant="outline">Update</Button></form></div>)}</div> : <p className="mt-4 text-sm text-[var(--betanor-muted)]">No milestones yet. Add the first acceptance checkpoint on the left.</p>}</Card><Card className="p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Project tasks</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">{tasks.length} linked task{tasks.length === 1 ? "" : "s"}</p></div><Link href="/workspace/tasks" className="text-xs font-semibold text-[var(--betanor-blue)] hover:underline">Add task</Link></div>{tasks.length ? <div className="mt-4 divide-y divide-[var(--betanor-border)]">{tasks.map((task) => <div key={task.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><Link href={`/workspace/tasks/${task.id}`} className="font-semibold text-[var(--betanor-navy)] hover:text-[var(--betanor-blue)]">{task.title}</Link><p className="mt-1 text-xs text-[var(--betanor-muted)]">{task.due_on ? `Due ${task.due_on}` : "No due date"} · {titleCase(task.priority)} priority</p></div><Badge tone={tone(task.status)}>{titleCase(task.status)}</Badge></div>)}</div> : <p className="mt-4 text-sm text-[var(--betanor-muted)]">No linked tasks. Add one from the work queue and choose this project.</p>}</Card></div></div></main>;
}
