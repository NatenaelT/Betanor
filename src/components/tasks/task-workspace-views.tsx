"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type TaskWorkspaceItem = {
  id: string;
  task_code: string;
  title: string;
  status: string;
  priority: string;
  due_on: string | null;
  project_label: string;
  milestone_label: string | null;
  owners: string[];
};

const statuses = ["not_started", "in_progress", "blocked", "completed", "cancelled"];
function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function statusTone(status: string) { return status === "completed" ? "success" as const : status === "blocked" || status === "cancelled" ? "danger" as const : status === "in_progress" ? "info" as const : "draft" as const; }
function priorityTone(priority: string) { return priority === "urgent" ? "danger" as const : priority === "high" ? "warning" as const : "neutral" as const; }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

function TaskCard({ task }: { task: TaskWorkspaceItem }) {
  return <Link href={`/workspace/tasks/${task.id}`} className="block rounded-xl border border-[var(--betanor-border)] bg-white p-4 transition hover:border-[var(--betanor-blue)]/40 hover:shadow-sm">
    <div className="flex items-start justify-between gap-2"><span className="text-[10px] font-semibold tracking-wide text-[var(--betanor-muted)]">{task.task_code}</span><Badge tone={priorityTone(task.priority)}>{titleCase(task.priority)}</Badge></div>
    <p className="mt-2 font-semibold leading-5 text-[var(--betanor-navy)]">{task.title}</p>
    <p className="mt-2 truncate text-xs text-[var(--betanor-muted)]">{task.project_label}{task.milestone_label ? ` · ${task.milestone_label}` : ""}</p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--betanor-muted)]"><span>{task.owners.length ? task.owners.join(", ") : "Unassigned"}</span><span>{task.due_on ? `Due ${task.due_on}` : "No due date"}</span></div>
  </Link>;
}

export function TaskWorkspaceViews({ tasks }: { tasks: TaskWorkspaceItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [view, setView] = useState<"list" | "board" | "calendar">("list");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesTerm = !term || [task.title, task.task_code, task.project_label, task.milestone_label, ...task.owners].some((value) => value?.toLowerCase().includes(term));
      return matchesTerm && (statusFilter === "all" || task.status === statusFilter) && (priorityFilter === "all" || task.priority === priorityFilter);
    });
  }, [priorityFilter, query, statusFilter, tasks]);

  const monthDays = useMemo(() => {
    const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
    const firstCell = new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => new Date(firstCell.getFullYear(), firstCell.getMonth(), firstCell.getDate() + index));
  }, [month]);
  const tasksByDueDate = useMemo(() => {
    const grouped = new Map<string, TaskWorkspaceItem[]>();
    for (const task of filtered) {
      if (!task.due_on) continue;
      grouped.set(task.due_on, [...(grouped.get(task.due_on) ?? []), task]);
    }
    return grouped;
  }, [filtered]);

  return <section className="mt-8">
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--betanor-border)] bg-white p-4 shadow-sm 2xl:flex-row 2xl:items-end 2xl:justify-between 2xl:p-5">
      <div><h2 className="font-semibold text-[var(--betanor-navy)]">Task workspace</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">{filtered.length} of {tasks.length} tasks · {tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).length} active</p></div>
      <div className="grid min-w-0 gap-2 xl:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto]">
        <Input aria-label="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, project, owner" />
        <select aria-label="Filter tasks by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select>
        <select aria-label="Filter tasks by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="min-h-10 rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="all">All priorities</option>{["urgent", "high", "medium", "low"].map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}</select>
        <div className="inline-flex min-h-10 items-center rounded-lg border border-[var(--betanor-border)] bg-slate-50 p-1">{(["list", "board", "calendar"] as const).map((item) => <button key={item} type="button" onClick={() => setView(item)} aria-pressed={view === item} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold capitalize transition ${view === item ? "bg-white text-[var(--betanor-navy)] shadow-sm" : "text-[var(--betanor-muted)] hover:text-[var(--betanor-navy)]"}`}>{item}</button>)}</div>
      </div>
    </div>

    {filtered.length === 0 ? <Card className="mt-4 p-8 text-center"><p className="font-semibold text-[var(--betanor-navy)]">{tasks.length ? "No tasks match these filters" : "No tasks yet"}</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">Create a task above or adjust your filters.</p></Card> : view === "list" ? <Card className="mt-4 overflow-hidden"><div className="hidden grid-cols-[minmax(16rem,1.8fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(7rem,.8fr)_minmax(7rem,.7fr)] gap-3 border-b border-[var(--betanor-border)] bg-slate-50 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--betanor-muted)] xl:grid"><span>Task</span><span>Project</span><span>Owner</span><span>Due date</span><span>Status</span></div><div className="divide-y divide-[var(--betanor-border)]">{filtered.map((task) => <Link key={task.id} href={`/workspace/tasks/${task.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(16rem,1.8fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(7rem,.8fr)_minmax(7rem,.7fr)] xl:items-center"><span className="min-w-0"><span className="block truncate font-semibold text-[var(--betanor-navy)]">{task.title}</span><span className="mt-1 block text-xs text-[var(--betanor-muted)]">{task.task_code} · <span className="capitalize">{task.priority}</span> priority</span></span><span className="truncate text-sm text-[var(--betanor-muted)]">{task.project_label}{task.milestone_label ? ` · ${task.milestone_label}` : ""}</span><span className="truncate text-sm text-[var(--betanor-muted)]">{task.owners.length ? task.owners.join(", ") : "Unassigned"}</span><span className="text-sm text-[var(--betanor-muted)]">{task.due_on || "Unscheduled"}</span><Badge tone={statusTone(task.status)}>{titleCase(task.status)}</Badge></Link>)}</div></Card> : view === "board" ? <div className="mt-4 grid gap-4 xl:grid-cols-5">{statuses.map((status) => { const column = filtered.filter((task) => task.status === status); return <section key={status} aria-label={`${titleCase(status)} tasks`} className="min-w-0 rounded-2xl border border-[var(--betanor-border)] bg-slate-50/70 p-3"><div className="mb-3 flex items-center justify-between gap-2 px-1"><h3 className="text-xs font-bold uppercase tracking-wide text-[var(--betanor-navy)]">{titleCase(status)}</h3><span className="grid size-6 place-items-center rounded-full bg-white text-[10px] font-semibold text-[var(--betanor-muted)]">{column.length}</span></div><div className="space-y-2">{column.length ? column.map((task) => <TaskCard key={task.id} task={task} />) : <p className="rounded-xl border border-dashed border-[var(--betanor-border)] px-3 py-6 text-center text-xs text-[var(--betanor-muted)]">No tasks</p>}</div></section>; })}</div> : <Card className="mt-4 min-w-0 overflow-hidden p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold text-[var(--betanor-navy)]">Due-date calendar</h3><p className="mt-1 text-xs text-[var(--betanor-muted)]">Monday-first calendar · tasks without dates remain in the list view.</p></div><div className="flex items-center gap-2"><button type="button" aria-label="Previous month" onClick={() => setMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))} className="grid size-9 place-items-center rounded-lg border border-[var(--betanor-border)] hover:bg-slate-50">‹</button><p className="min-w-32 text-center text-sm font-semibold text-[var(--betanor-navy)]">{month.toLocaleDateString("en", { month: "long", year: "numeric" })}</p><button type="button" aria-label="Next month" onClick={() => setMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))} className="grid size-9 place-items-center rounded-lg border border-[var(--betanor-border)] hover:bg-slate-50">›</button></div></div><div className="overflow-x-auto overscroll-x-contain"><div className="grid min-w-[700px] grid-cols-7 border-l border-t border-[var(--betanor-border)]">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="border-r border-b border-[var(--betanor-border)] bg-slate-50 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-[var(--betanor-muted)]">{day}</div>)}{monthDays.map((date) => { const key = dateKey(date); const dayTasks = tasksByDueDate.get(key) ?? []; const isCurrentMonth = date.getMonth() === month.getMonth(); return <div key={key} className={`min-h-28 border-r border-b border-[var(--betanor-border)] p-1.5 ${isCurrentMonth ? "bg-white" : "bg-slate-50/70"}`}><p className={`mb-1 pl-1 text-xs ${isCurrentMonth ? "font-semibold text-[var(--betanor-navy)]" : "text-slate-400"}`}>{date.getDate()}</p><div className="space-y-1">{dayTasks.slice(0, 3).map((task) => <Link key={task.id} href={`/workspace/tasks/${task.id}`} className="block truncate rounded-md bg-blue-50 px-1.5 py-1 text-[10px] font-medium text-blue-900 hover:bg-blue-100" title={task.title}>{task.title}</Link>)}{dayTasks.length > 3 ? <p className="px-1.5 text-[10px] text-[var(--betanor-muted)]">+{dayTasks.length - 3} more</p> : null}</div></div>; })}</div></div></Card>}
  </section>;
}
