"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type ProjectPortfolioItem = {
  id: string;
  project_code: string;
  name: string;
  status: string;
  customer: string;
  budget_amount: number | null;
  currency_code: string;
  starts_on: string | null;
  ends_on: string | null;
  milestone_count: number;
  task_count: number;
};

const projectStatuses = ["not_started", "in_progress", "blocked", "completed", "cancelled"];
function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function statusTone(status: string) { return status === "completed" ? "success" as const : status === "blocked" || status === "cancelled" ? "danger" as const : status === "in_progress" ? "info" as const : "draft" as const; }

export function ProjectPortfolio({ projects }: { projects: ProjectPortfolioItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"cards" | "list">("cards");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesQuery = !term || [project.name, project.project_code, project.customer].some((value) => value.toLowerCase().includes(term));
      return matchesQuery && (statusFilter === "all" || project.status === statusFilter);
    });
  }, [projects, query, statusFilter]);

  return <>
    <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Portfolio", projects.length],
        ["In progress", projects.filter((project) => project.status === "in_progress").length],
        ["Blocked", projects.filter((project) => project.status === "blocked").length],
        ["Completed", projects.filter((project) => project.status === "completed").length],
      ].map(([label, count]) => <Card key={String(label)} className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--betanor-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--betanor-navy)]">{count}</p></Card>)}
    </div>
    <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="text-xl font-semibold text-[var(--betanor-navy)]">Project portfolio</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">{filtered.length} of {projects.length} projects visible to your role.</p></div>
      <div className="grid gap-2 sm:grid-cols-[minmax(13rem,1fr)_11rem_auto]">
        <Input aria-label="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, codes, customers" />
        <select aria-label="Filter projects by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="all">All statuses</option>{projectStatuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select>
        <div className="inline-flex min-h-10 items-center rounded-lg border border-[var(--betanor-border)] bg-white p-1"><button type="button" onClick={() => setView("cards")} aria-pressed={view === "cards"} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${view === "cards" ? "bg-[var(--betanor-nav-bg)] text-white" : "text-[var(--betanor-muted)]"}`}>Cards</button><button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${view === "list" ? "bg-[var(--betanor-nav-bg)] text-white" : "text-[var(--betanor-muted)]"}`}>List</button></div>
      </div>
    </div>
    {!filtered.length ? <Card className="mt-4 p-8 text-center"><p className="font-semibold text-[var(--betanor-navy)]">{projects.length ? "No projects match these filters" : "No projects found"}</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">Create a project above to begin organizing delivery work.</p></Card> : view === "cards" ? <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((project) => <Card key={project.id} className="flex h-full min-w-0 flex-col p-5 transition-shadow hover:shadow-md"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)]">{project.project_code}</p><Link href={`/workspace/projects/${project.id}`} className="mt-2 block truncate font-semibold text-[var(--betanor-navy)] hover:text-[var(--betanor-blue)]">{project.name}</Link></div><Badge className="max-w-[45%] shrink-0 whitespace-normal text-right" tone={statusTone(project.status)}>{titleCase(project.status)}</Badge></div><p className="mt-4 min-w-0 break-words text-sm text-[var(--betanor-muted)] [overflow-wrap:anywhere]">{project.customer} · {project.budget_amount ? `${project.currency_code} ${Number(project.budget_amount).toLocaleString()}` : "Budget to be confirmed"}</p><div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--betanor-muted)]"><span className="rounded-full bg-slate-50 px-2.5 py-1">{project.task_count} tasks</span><span className="rounded-full bg-slate-50 px-2.5 py-1">{project.milestone_count} milestones</span></div><p className="mt-3 min-w-0 break-words text-xs text-[var(--betanor-muted)] [overflow-wrap:anywhere]">{project.starts_on || "Start date not set"} <span aria-hidden="true">→</span> {project.ends_on || "End date not set"}</p><Link href={`/workspace/projects/${project.id}`} className="mt-auto min-h-11 pt-5 text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Open project →</Link></Card>)}</div> : <Card className="mt-4 min-w-0 overflow-hidden"><div className="hidden grid-cols-[minmax(16rem,1.6fr)_1fr_1fr_1fr_auto] gap-4 border-b border-[var(--betanor-border)] bg-slate-50 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--betanor-muted)] sm:grid"><span>Project</span><span>Customer</span><span>Timeline</span><span>Work</span><span>Status</span></div><div className="divide-y divide-[var(--betanor-border)]">{filtered.map((project) => <Link key={project.id} href={`/workspace/projects/${project.id}`} className="grid min-w-0 gap-3 px-5 py-4 transition hover:bg-slate-50 sm:grid-cols-[minmax(16rem,1.6fr)_1fr_1fr_1fr_auto] sm:items-center sm:gap-4"><span className="min-w-0"><span className="block truncate font-semibold text-[var(--betanor-navy)]">{project.name}</span><span className="mt-1 block text-xs text-[var(--betanor-muted)]">{project.project_code}</span></span><span className="break-words text-sm text-[var(--betanor-muted)]">{project.customer}</span><span className="break-words text-xs text-[var(--betanor-muted)]">{project.starts_on || "—"} → {project.ends_on || "—"}</span><span className="text-sm text-[var(--betanor-muted)]">{project.task_count} tasks · {project.milestone_count} milestones</span><Badge tone={statusTone(project.status)}>{titleCase(project.status)}</Badge></Link>)}</div></Card>}
  </>;
}
