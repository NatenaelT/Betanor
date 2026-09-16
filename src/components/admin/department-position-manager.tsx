"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";

type Department = { id: string; name: string; code: string; status: string; parent_id: string | null };
type Position = { id: string; title: string; code: string | null; status: string; department_id: string };

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

export function DepartmentPositionManager() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [editingDepartment, setEditingDepartment] = useState<string | null>(null);
  const [editingPosition, setEditingPosition] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await requestJson("/api/admin/organization");
    setDepartments(data.departments ?? []);
    setPositions(data.positions ?? []);
    setSelectedDepartmentId((current) => current || data.departments?.[0]?.id || "");
  }

  useEffect(() => {
    let active = true;
    requestJson("/api/admin/organization").then((data) => {
      if (!active) return;
      setDepartments(data.departments ?? []);
      setPositions(data.positions ?? []);
      setSelectedDepartmentId(data.departments?.[0]?.id || "");
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load the organization structure.");
    });
    return () => { active = false; };
  }, []);

  const visiblePositions = useMemo(() => selectedDepartmentId ? positions.filter((position) => position.department_id === selectedDepartmentId) : [], [positions, selectedDepartmentId]);

  async function submit(event: React.FormEvent<HTMLFormElement>, body: Record<string, unknown>) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try { await requestJson("/api/admin/organization", { method: "POST", body: JSON.stringify(body) }); await refresh(); setMessage(body.entity === "department" ? "Department created." : "Position created with an automatic code."); event.currentTarget.reset(); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Could not save the record."); }
    finally { setBusy(false); }
  }

  async function update(event: React.FormEvent<HTMLFormElement>, body: Record<string, unknown>) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try { await requestJson("/api/admin/organization", { method: "PATCH", body: JSON.stringify(body) }); await refresh(); setMessage("Changes saved."); setEditingDepartment(null); setEditingPosition(null); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Could not save changes."); }
    finally { setBusy(false); }
  }

  async function remove(entity: "department" | "position", id: string) {
    if (!window.confirm(`Delete this ${entity}? Records with history must be set inactive instead.`)) return;
    setBusy(true); setError(null); setMessage(null);
    try { await requestJson("/api/admin/organization", { method: "DELETE", body: JSON.stringify({ entity, id }) }); await refresh(); setMessage(`${entity[0].toUpperCase()}${entity.slice(1)} deleted.`); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Could not delete the record."); }
    finally { setBusy(false); }
  }

  return <div className="mt-8"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-xl font-semibold text-[var(--betanor-navy)]">Departments & departmental positions</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--betanor-muted)]">Positions are conditional on a department. Leave the code blank and Supabase generates a stable DEPT-### or DEPTCODE-P### identifier.</p></div><Badge tone="info">HR / admin protected</Badge></div>{error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}{message ? <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message}</p> : null}<div className="mt-5 grid gap-6 xl:grid-cols-[.8fr_1.2fr]"><Card className="p-5 sm:p-6"><h3 className="font-semibold text-[var(--betanor-navy)]">Add department</h3><form className="mt-4 grid gap-3" onSubmit={(event) => { const form = new FormData(event.currentTarget); return submit(event, { entity: "department", name: form.get("name"), code: form.get("code") }); }}><div><FieldLabel htmlFor="new-department-name">Department name</FieldLabel><Input id="new-department-name" name="name" required minLength={2} /></div><div><FieldLabel htmlFor="new-department-code">Code (optional)</FieldLabel><Input id="new-department-code" name="code" placeholder="Auto-generated if blank" /></div><Button disabled={busy} type="submit">Create department</Button></form><div className="mt-6 space-y-2">{departments.map((department) => <div key={department.id} className="rounded-lg border border-[var(--betanor-border)] p-3">{editingDepartment === department.id ? <form className="grid gap-2" onSubmit={(event) => { const form = new FormData(event.currentTarget); return update(event, { entity: "department", id: department.id, name: form.get("name"), parentId: form.get("parentId"), status: form.get("status") }); }}><Input name="name" defaultValue={department.name} required minLength={2} /><select name="parentId" defaultValue={department.parent_id ?? ""} className="min-h-10 rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No parent department</option>{departments.filter((item) => item.id !== department.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select name="status" defaultValue={department.status} className="min-h-10 rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="active">Active</option><option value="inactive">Inactive</option></select><div className="flex gap-2"><Button disabled={busy} size="sm" type="submit">Save</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEditingDepartment(null)}>Cancel</Button></div></form> : <div className="flex items-center justify-between gap-3"><button type="button" onClick={() => setSelectedDepartmentId(department.id)} className="min-w-0 text-left"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{department.name}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">{department.code}</p></button><div className="flex shrink-0 items-center gap-1"><Badge tone={department.status === "active" ? "success" : "neutral"}>{department.status}</Badge><Button size="sm" type="button" variant="ghost" onClick={() => setEditingDepartment(department.id)}>Edit</Button><Button size="sm" type="button" variant="ghost" onClick={() => remove("department", department.id)}>Delete</Button></div></div>}</div>)}</div></Card><Card className="p-5 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h3 className="font-semibold text-[var(--betanor-navy)]">Positions for selected department</h3><p className="mt-1 text-sm text-[var(--betanor-muted)]">Choose a department first; the position list and create form stay scoped to it.</p></div><select aria-label="Selected department" value={selectedDepartmentId} onChange={(event) => setSelectedDepartmentId(event.target.value)} className="min-h-10 rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name} · {department.code}</option>)}</select></div>{selectedDepartmentId ? <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]" onSubmit={(event) => { const form = new FormData(event.currentTarget); return submit(event, { entity: "position", title: form.get("title"), code: form.get("code"), departmentId: selectedDepartmentId }); }}><div><FieldLabel htmlFor="new-position-title">Position title</FieldLabel><Input id="new-position-title" name="title" required minLength={2} /></div><div><FieldLabel htmlFor="new-position-code">Code (optional)</FieldLabel><Input id="new-position-code" name="code" placeholder="Auto-generated" /></div><div className="flex items-end"><Button disabled={busy} type="submit">Create position</Button></div></form> : <p className="mt-5 rounded-lg bg-slate-50 px-3 py-3 text-sm text-[var(--betanor-muted)]">Select a department to add or edit its positions.</p>}{selectedDepartmentId ? <div className="mt-6 divide-y divide-[var(--betanor-border)]">{visiblePositions.length ? visiblePositions.map((position) => <div key={position.id} className="py-3">{editingPosition === position.id ? <form className="grid gap-2 sm:grid-cols-[1fr_160px_130px_auto]" onSubmit={(event) => { const form = new FormData(event.currentTarget); return update(event, { entity: "position", id: position.id, title: form.get("title"), code: form.get("code"), departmentId: form.get("departmentId"), status: form.get("status") }); }}><Input name="title" defaultValue={position.title} required minLength={2} /><Input name="code" defaultValue={position.code ?? ""} /><select name="departmentId" defaultValue={position.department_id} className="min-h-10 rounded-lg border border-[var(--betanor-border)] bg-white px-2 text-sm">{departments.map((department) => <option key={department.id} value={department.id}>{department.code}</option>)}</select><div className="flex gap-1"><Button disabled={busy} size="sm" type="submit">Save</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEditingPosition(null)}>×</Button></div></form> : <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[var(--betanor-navy)]">{position.title}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">{position.code || "Code pending"}</p></div><div className="flex items-center gap-1"><Badge tone={position.status === "active" ? "success" : "neutral"}>{position.status}</Badge><Button size="sm" type="button" variant="ghost" onClick={() => setEditingPosition(position.id)}>Edit</Button><Button size="sm" type="button" variant="ghost" onClick={() => remove("position", position.id)}>Delete</Button></div></div>}</div>) : <p className="py-5 text-sm text-[var(--betanor-muted)]">No positions are assigned to this department yet.</p>}</div> : null}</Card></div></div>;
}
