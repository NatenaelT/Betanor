import Link from "next/link";
import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function createEmployee(data: FormData) {
  "use server";
  const firstName = String(data.get("firstName") ?? "").trim();
  const lastName = String(data.get("lastName") ?? "").trim();
  const hireDate = String(data.get("hireDate") ?? "");
  if (!firstName || !lastName || !hireDate) return;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return;
  const { data: profile } = await supabase.from("profiles").select("workspace_id").eq("id", userId).maybeSingle();
  const { data: fallback } = !profile?.workspace_id ? await supabase.from("workspaces").select("id").limit(1) : { data: [] };
  const workspaceId = profile?.workspace_id ?? fallback?.[0]?.id;
  if (!workspaceId) return;
  const { data: employee } = await supabase.from("employees").insert({
    workspace_id: workspaceId,
    first_name: firstName,
    last_name: lastName,
    work_email: String(data.get("workEmail") ?? "").trim() || null,
    work_phone: String(data.get("workPhone") ?? "").trim() || null,
    hire_date: hireDate,
    department_id: String(data.get("departmentId") ?? "") || null,
    position_id: String(data.get("positionId") ?? "") || null,
    manager_id: String(data.get("managerId") ?? "") || null,
    employment_type: String(data.get("employmentType") ?? "full_time"),
    probation_end_date: String(data.get("probationEndDate") ?? "") || null,
    work_hours_per_day: 8,
    work_days_per_week: 5,
  }).select("id").single();
  const salary = Number(data.get("salary") ?? 0);
  if (employee?.id && salary > 0) {
    await supabase.from("employment_contracts").insert({
      employee_id: employee.id,
      contract_number: `BTNR-CTR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`,
      title: String(data.get("contractTitle") ?? "Employment contract").trim() || "Employment contract",
      starts_on: hireDate,
      salary_amount: salary,
      currency_code: "ETB",
      status: "draft",
    });
  }
  revalidatePath("/workspace/employees");
}

function seniority(hireDate: string | null) {
  if (!hireDate) return "Start date not recorded";
  const start = new Date(`${hireDate}T00:00:00`);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) return "Starts soon";
  return `${years} year${years === 1 ? "" : "s"} ${months} month${months === 1 ? "" : "s"}`;
}

export default async function EmployeesPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const { data: profileData } = userId ? await supabase.from("profiles").select("workspace_id").eq("id", userId).maybeSingle() : { data: null };
  const { data: fallbackWorkspaces } = !profileData?.workspace_id ? await supabase.from("workspaces").select("id").limit(1) : { data: [] };
  const profile = profileData?.workspace_id ? profileData : fallbackWorkspaces?.[0] ? { workspace_id: fallbackWorkspaces[0].id } : null;
  const workspaceId = profile?.workspace_id;
  const [departments, positions, employees] = await Promise.all([
    workspaceId ? supabase.from("departments").select("id,name,code").eq("workspace_id", workspaceId).order("name") : Promise.resolve({ data: [] as never[] }),
    workspaceId ? supabase.from("positions").select("id,title,code").eq("workspace_id", workspaceId).order("title") : Promise.resolve({ data: [] as never[] }),
    workspaceId ? supabase.from("employees").select("id,employee_number,first_name,last_name,work_email,work_phone,hire_date,employment_status,employment_type,probation_end_date,department_id,position_id,manager_id,work_hours_per_day,work_days_per_week,departments(name),positions(title),employment_contracts(id,title,starts_on,ends_on,salary_amount,currency_code,status)").eq("workspace_id", workspaceId).order("hire_date", { ascending: false }) : Promise.resolve({ data: [] as never[] }),
  ]);
  const rows = employees.data ?? [];
  const managerNames = new Map(rows.map((employee) => [employee.id, `${employee.first_name} ${employee.last_name}`]));

  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">People module</p><h1 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">Employee directory</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Every staff profile carries an automatic Betanor ID, start date, position, salary record, reporting line, and standard Monday–Friday work schedule.</p></div><Link href="/workspace/leave" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Open leave desk →</Link></div>{profile?.workspace_id ? <Card className="mt-8 p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Create employee profile</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">The employee number is generated by Supabase when the profile is saved.</p><form action={createEmployee} className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3"><div><FieldLabel htmlFor="employee-first">First name</FieldLabel><Input id="employee-first" name="firstName" required/></div><div><FieldLabel htmlFor="employee-last">Last name</FieldLabel><Input id="employee-last" name="lastName" required/></div><div><FieldLabel htmlFor="employee-email">Work email</FieldLabel><Input id="employee-email" name="workEmail" type="email"/></div><div><FieldLabel htmlFor="employee-phone">Work phone</FieldLabel><Input id="employee-phone" name="workPhone" type="tel"/></div><div><FieldLabel htmlFor="employee-start">Start date</FieldLabel><Input id="employee-start" name="hireDate" required type="date"/></div><div><FieldLabel htmlFor="employee-probation">Probation end date</FieldLabel><Input id="employee-probation" name="probationEndDate" type="date"/></div><div><FieldLabel htmlFor="employee-department">Department</FieldLabel><select id="employee-department" name="departmentId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Select department</option>{departments.data?.map((department) => <option key={department.id} value={department.id}>{department.name} · {department.code}</option>)}</select></div><div><FieldLabel htmlFor="employee-position">Position</FieldLabel><select id="employee-position" name="positionId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Select position</option>{positions.data?.map((position) => <option key={position.id} value={position.id}>{position.title}{position.code ? ` · ${position.code}` : ""}</option>)}</select></div><div><FieldLabel htmlFor="employee-manager">Immediate manager</FieldLabel><select id="employee-manager" name="managerId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No manager recorded</option>{rows.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name} · {employee.employee_number}</option>)}</select></div><div><FieldLabel htmlFor="employee-type">Employment type</FieldLabel><select id="employee-type" name="employmentType" defaultValue="full_time" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option></select></div><div><FieldLabel htmlFor="employee-salary">Monthly salary (ETB)</FieldLabel><Input id="employee-salary" min="0" name="salary" step="0.01" type="number"/></div><div><FieldLabel htmlFor="employee-contract">Contract title</FieldLabel><Input id="employee-contract" name="contractTitle" defaultValue="Employment contract"/></div><div className="lg:col-span-3 flex flex-wrap items-center gap-3"><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900">Standard schedule: Monday–Friday · 8 hours/day · 40 hours/week</span><Button type="submit">Create employee profile</Button></div></form></Card> : <Card className="mt-8 p-6">Employee access is required for this workspace.</Card>}<div className="mt-10 flex items-center justify-between"><div><h2 className="text-xl font-semibold text-[var(--betanor-navy)]">All employees</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">{rows.length} profile{rows.length === 1 ? "" : "s"} in this workspace.</p></div></div>{rows.length ? <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map((employee) => { const contracts = employee.employment_contracts ?? []; const currentContract = [...contracts].sort((a, b) => String(b.starts_on).localeCompare(String(a.starts_on)))[0]; return <Card key={employee.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><Link href={`/workspace/employees/${employee.id}`} className="font-semibold text-[var(--betanor-navy)] hover:text-[var(--betanor-blue)]">{employee.first_name} {employee.last_name}</Link><p className="mt-1 text-xs font-semibold tracking-wide text-[var(--betanor-blue)]">{employee.employee_number}</p></div><Badge tone={employee.employment_status === "active" ? "success" : "neutral"}>{employee.employment_status}</Badge></div><p className="mt-4 text-sm text-[var(--betanor-text)]">{employee.positions?.[0]?.title || "Position to be assigned"} · {employee.departments?.[0]?.name || "Department to be assigned"}</p><dl className="mt-4 space-y-2 text-xs text-[var(--betanor-muted)]"><div className="flex justify-between gap-3"><dt>Seniority</dt><dd className="font-semibold text-[var(--betanor-navy)]">{seniority(employee.hire_date)}</dd></div><div className="flex justify-between gap-3"><dt>Start date</dt><dd>{employee.hire_date || "Not recorded"}</dd></div><div className="flex justify-between gap-3"><dt>Salary</dt><dd>{currentContract?.salary_amount ? `${currentContract.currency_code} ${Number(currentContract.salary_amount).toLocaleString()}` : "Not recorded"}</dd></div><div className="flex justify-between gap-3"><dt>Manager</dt><dd>{employee.manager_id ? managerNames.get(employee.manager_id) || "Recorded" : "Not recorded"}</dd></div></dl><div className="mt-4 border-t border-[var(--betanor-border)] pt-3 text-xs text-[var(--betanor-muted)]">{employee.work_days_per_week} days · {employee.work_hours_per_day} hours/day · {employee.work_email || "No work email"}</div></Card>; })}</div> : <Card className="mt-4 p-8"><p className="font-semibold text-[var(--betanor-navy)]">No employee profiles yet.</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">HR can create the first profile above. The database will generate the employee ID.</p></Card>}</main>;
}
