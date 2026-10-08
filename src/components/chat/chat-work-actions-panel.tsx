"use client";

import { useState } from "react";

import { createChatProject, createChatTask, shareChatProject, shareChatTask } from "@/app/workspace/chats/actions";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/input";

type WorkOptions = {
  projects: Array<{ id: string; name: string; project_code: string | null }>;
  tasks: Array<{ id: string; title: string; task_code: string | null }>;
  employees: Array<{ id: string; first_name: string; last_name: string; employee_number: string | null }>;
};

export function ChatWorkActionsPanel({ conversationId, canCreateTask, canAssignTask, canManageProject, canShareWork }: {
  conversationId: string;
  canCreateTask: boolean;
  canAssignTask: boolean;
  canManageProject: boolean;
  canShareWork: boolean;
}) {
  const [options, setOptions] = useState<WorkOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadOptions() {
    if (options || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chats/work-options", { cache: "no-store" });
      const result = await response.json() as WorkOptions & { error?: string };
      if (!response.ok) throw new Error(result.error || "Work options could not be loaded.");
      setOptions(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Work options could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  return <details className="border-b border-[var(--betanor-border)] bg-slate-50/70" onToggle={(event) => { if (event.currentTarget.open) void loadOptions(); }}>
    <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-semibold text-[var(--betanor-navy)] [&::-webkit-details-marker]:hidden"><span>＋ Create, assign, or share work</span><span className="text-[10px] font-normal text-[var(--betanor-muted)]">Role and record access applies</span></summary>
    <div className="grid gap-3 border-t border-[var(--betanor-border)] p-3 sm:grid-cols-2">
      {loading ? <p className="rounded-lg bg-white p-3 text-xs text-[var(--betanor-muted)] sm:col-span-2">Loading available work options…</p> : null}
      {error ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 sm:col-span-2"><span>{error}</span><Button type="button" size="sm" variant="outline" onClick={() => void loadOptions()}>Retry</Button></div> : null}
      {canCreateTask ? <form action={createChatTask} className="space-y-2 rounded-lg border border-[var(--betanor-border)] bg-white p-3"><input type="hidden" name="conversationId" value={conversationId}/><p className="text-xs font-bold text-[var(--betanor-navy)]">Create and assign task</p><div><FieldLabel required htmlFor="chat-task-title">Task title</FieldLabel><Input id="chat-task-title" name="title" required maxLength={180} placeholder="What needs to get done?"/></div><div className="grid gap-2 sm:grid-cols-2"><div><FieldLabel htmlFor="chat-task-project">Project</FieldLabel><select id="chat-task-project" name="projectId" className="min-h-9 w-full rounded-lg border border-[var(--betanor-field-border)] bg-white px-2 text-xs"><option value="">No project</option>{options?.projects.map((project) => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}</select></div><div><FieldLabel htmlFor="chat-task-priority">Priority</FieldLabel><select id="chat-task-priority" name="priority" defaultValue="medium" className="min-h-9 w-full rounded-lg border border-[var(--betanor-field-border)] bg-white px-2 text-xs"><option value="low">Low</option><option value="medium">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div></div>{canAssignTask ? <div><FieldLabel htmlFor="chat-task-assignee">Assign to · type @staffname</FieldLabel><Input id="chat-task-assignee" name="assigneeMention" list={`chat-staff-mentions-${conversationId}`} autoComplete="off" placeholder="@First Last"/><datalist id={`chat-staff-mentions-${conversationId}`}>{options?.employees.map((person) => <option key={person.id} value={`@${person.first_name} ${person.last_name} · ${person.employee_number || person.id.slice(0, 8)}`}/>)}</datalist><p className="mt-1 text-[10px] text-[var(--betanor-muted)]">Choose a staff suggestion, or enter a unique @full name.</p></div> : null}<div><FieldLabel htmlFor="chat-task-due">Due date</FieldLabel><Input id="chat-task-due" name="dueOn" type="date"/></div><details className="rounded-lg bg-slate-50 p-2"><summary className="cursor-pointer text-[11px] font-semibold text-[var(--betanor-muted)]">Add scope and start date</summary><div className="mt-2 space-y-2"><Input name="startsOn" aria-label="Start date" type="date"/><textarea name="description" rows={2} maxLength={4000} aria-label="Task scope and acceptance notes" placeholder="Scope / acceptance notes" className="w-full rounded-lg border border-[var(--betanor-field-border)] px-2 py-1.5 text-xs"/></div></details><Button type="submit" size="sm">Create task</Button></form> : null}
      {canManageProject ? <form action={createChatProject} className="space-y-2 rounded-lg border border-[var(--betanor-border)] bg-white p-3"><input type="hidden" name="conversationId" value={conversationId}/><p className="text-xs font-bold text-[var(--betanor-navy)]">Create project</p><div><FieldLabel required htmlFor="chat-project-name">Project name</FieldLabel><Input id="chat-project-name" name="name" required maxLength={180} placeholder="Delivery project"/></div><details className="rounded-lg bg-slate-50 p-2"><summary className="cursor-pointer text-[11px] font-semibold text-[var(--betanor-muted)]">Add project scope</summary><textarea name="description" rows={3} maxLength={5000} className="mt-2 w-full rounded-lg border border-[var(--betanor-field-border)] px-2 py-1.5 text-xs" placeholder="Scope and intended outcomes"/></details><Button type="submit" size="sm">Create project</Button></form> : null}
      {canShareWork && options?.tasks.length ? <form action={shareChatTask} className="flex items-end gap-2 rounded-lg border border-[var(--betanor-border)] bg-white p-3"><input type="hidden" name="conversationId" value={conversationId}/><div className="min-w-0 flex-1"><FieldLabel required htmlFor="chat-share-task">Share accessible task</FieldLabel><select id="chat-share-task" name="taskId" required className="min-h-9 w-full rounded-lg border border-[var(--betanor-field-border)] bg-white px-2 text-xs"><option value="">Choose task</option>{options.tasks.map((task) => <option key={task.id} value={task.id}>{task.task_code || task.title} · {task.title}</option>)}</select></div><Button type="submit" size="sm" variant="outline">Share</Button></form> : null}
      {canShareWork && options?.projects.length ? <form action={shareChatProject} className="flex items-end gap-2 rounded-lg border border-[var(--betanor-border)] bg-white p-3"><input type="hidden" name="conversationId" value={conversationId}/><div className="min-w-0 flex-1"><FieldLabel required htmlFor="chat-share-project">Share accessible project</FieldLabel><select id="chat-share-project" name="projectId" required className="min-h-9 w-full rounded-lg border border-[var(--betanor-field-border)] bg-white px-2 text-xs"><option value="">Choose project</option>{options.projects.map((project) => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}</select></div><Button type="submit" size="sm" variant="outline">Share</Button></form> : null}
    </div>
  </details>;
}
