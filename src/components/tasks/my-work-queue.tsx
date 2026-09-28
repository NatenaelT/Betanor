"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type MyWorkItem = {
  id: string;
  task_code: string;
  title: string;
  status: string;
  priority: string;
  due_on: string | null;
  description: string | null;
  project_label: string;
  milestone_label: string | null;
  created_by_me: boolean;
  assigned_employee_ids: string[];
  owners: string[];
};

function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function statusTone(status: string) { return status === "completed" ? "success" as const : status === "blocked" || status === "cancelled" ? "danger" as const : status === "in_progress" ? "info" as const : "draft" as const; }
function priorityTone(priority: string) { return priority === "urgent" ? "danger" as const : priority === "high" ? "warning" as const : "neutral" as const; }

function TaskLine({ task, updateTaskStatus }: { task: MyWorkItem; updateTaskStatus: (formData: FormData) => void | Promise<void> }) {
  return <Card className="p-4 transition-shadow hover:shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone(task.status)}>{titleCase(task.status)}</Badge><Badge tone={priorityTone(task.priority)}>{titleCase(task.priority)} priority</Badge>{task.created_by_me ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-800">Created by you</span> : null}</div><Link href={`/workspace/tasks/${task.id}`} className="mt-3 block text-lg font-semibold text-[var(--betanor-navy)] hover:text-[var(--betanor-blue)]">{task.title}</Link><p className="mt-2 text-xs text-[var(--betanor-muted)]">{task.task_code} · {task.project_label}{task.milestone_label ? ` · ${task.milestone_label}` : ""}</p>{task.description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-text)]">{task.description}</p> : null}<p className="mt-3 text-xs text-[var(--betanor-muted)]">{task.owners.length ? `Owner: ${task.owners.join(", ")}` : "Not assigned"}</p></div>
    <div className="flex shrink-0 flex-row items-end justify-between gap-3 md:flex-col md:items-end"><div className="md:text-right"><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--betanor-muted)]">Due</p><p className="mt-1 text-sm font-semibold text-[var(--betanor-navy)]">{task.due_on ?? "Not scheduled"}</p></div><form action={updateTaskStatus} className="flex gap-2"><input type="hidden" name="taskId" value={task.id} /><select name="status" aria-label={`Change status for ${task.title}`} defaultValue={task.status} className="min-h-9 max-w-36 rounded-lg border border-[var(--betanor-border)] bg-white px-2 text-xs"><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><Button type="submit" size="sm" variant="outline">Update</Button></form></div>
  </div></Card>;
}

export function MyWorkQueue({ tasks, employeeId, today, updateTaskStatus }: { tasks: MyWorkItem[]; employeeId: string | null; today: string; updateTaskStatus: (formData: FormData) => void | Promise<void> }) {
  const [tab, setTab] = useState<"todo" | "done" | "delegated">("todo");
  const { todo, done, delegated } = useMemo(() => {
    const assignedToMe = (task: MyWorkItem) => !employeeId || task.assigned_employee_ids.includes(employeeId);
    const isDone = (task: MyWorkItem) => ["completed", "cancelled"].includes(task.status);
    const delegatedTasks = tasks.filter((task) => task.created_by_me && task.assigned_employee_ids.some((id) => id !== employeeId));
    const todoTasks = tasks.filter((task) => !isDone(task) && (assignedToMe(task) || (task.created_by_me && task.assigned_employee_ids.length === 0)) && !delegatedTasks.includes(task));
    return { todo: todoTasks, done: tasks.filter(isDone), delegated: delegatedTasks };
  }, [employeeId, tasks]);

  const visible = tab === "todo" ? todo : tab === "done" ? done : delegated;
  const groupedTodo = useMemo(() => {
    const groups = new Map<string, MyWorkItem[]>([["Today", []], ["Overdue", []], ["Next", []], ["Unscheduled", []]]);
    for (const task of todo) {
      const group = !task.due_on ? "Unscheduled" : task.due_on < today ? "Overdue" : task.due_on === today ? "Today" : "Next";
      groups.set(group, [...(groups.get(group) ?? []), task]);
    }
    return [...groups.entries()];
  }, [today, todo]);

  return <>
    <Card className="mt-6 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--betanor-border)] px-4 py-3 sm:px-5"><div className="flex flex-wrap gap-1" role="tablist" aria-label="My work queues">{([ ["todo", "To Do", todo.length], ["done", "Done", done.length], ["delegated", "Delegated", delegated.length] ] as const).map(([key, label, count]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${tab === key ? "bg-[var(--betanor-nav-bg)] text-white" : "text-[var(--betanor-muted)] hover:bg-slate-100 hover:text-[var(--betanor-navy)]"}`}>{label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === key ? "bg-white/15" : "bg-slate-100"}`}>{count}</span></button>)}</div><p className="text-xs text-[var(--betanor-muted)]">Prioritized by due date · dates use the company timezone</p></div>
      <div className="p-4 sm:p-5">
        {tab === "todo" ? todo.length ? groupedTodo.filter(([, items]) => items.length > 0).map(([label, items]) => <section key={label} className="mb-6 last:mb-0"><div className="mb-3 flex items-center gap-2"><h2 className="text-sm font-semibold text-[var(--betanor-navy)]">{label}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-[var(--betanor-muted)]">{items.length}</span></div><div className="space-y-3">{items.map((task) => <TaskLine key={task.id} task={task} updateTaskStatus={updateTaskStatus} />)}</div></section>) : <div className="rounded-xl border border-dashed border-[var(--betanor-border)] px-5 py-12 text-center"><p className="font-semibold text-[var(--betanor-navy)]">Your queue is clear</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">Assigned tasks will appear here with due dates and project context.</p></div> : visible.length ? <div className="space-y-3">{visible.map((task) => <TaskLine key={task.id} task={task} updateTaskStatus={updateTaskStatus} />)}</div> : <div className="rounded-xl border border-dashed border-[var(--betanor-border)] px-5 py-12 text-center"><p className="font-semibold text-[var(--betanor-navy)]">{tab === "done" ? "No completed work yet" : "Nothing delegated yet"}</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">{tab === "delegated" ? "Tasks you assign to colleagues will appear here." : "Completed tasks will stay in this history."}</p></div>}
      </div>
    </Card>
  </>;
}
