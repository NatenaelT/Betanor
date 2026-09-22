import Link from "next/link";

import { EmployeeManagementPanel, type EmployeeAdminRecord } from "@/components/admin/employee-management-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

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
  const access = await resolveWorkspace(supabase);
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const { data: profileData } = userId ? await supabase.from("profiles").select("workspace_id").eq("id", userId).maybeSingle() : { data: null };
  const { data: fallbackWorkspaces } = !profileData?.workspace_id ? await supabase.from("workspaces").select("id").limit(1) : { data: [] };
  const workspaceId = profileData?.workspace_id ?? fallbackWorkspaces?.[0]?.id;

  const [departments, positions, profiles, roles, employees, accessRows] = await Promise.all([
    workspaceId ? supabase.from("departments").select("id,name,code").eq("workspace_id", workspaceId).order("name") : Promise.resolve({ data: [] as never[] }),
    workspaceId ? supabase.from("positions").select("id,title,code").eq("workspace_id", workspaceId).order("title") : Promise.resolve({ data: [] as never[] }),
    workspaceId ? supabase.from("profiles").select("id,full_name,job_title,workspace_id").order("full_name") : Promise.resolve({ data: [] as never[] }),
    workspaceId ? supabase.from("roles").select("code,name").is("workspace_id", null).eq("role_type", "staff").eq("is_system", true).order("name") : Promise.resolve({ data: [] as never[] }),
    workspaceId ? supabase.from("employees").select("id,profile_id,employee_number,first_name,last_name,work_email,work_phone,hire_date,employment_status,employment_type,probation_end_date,department_id,position_id,manager_id,work_hours_per_day,work_days_per_week,departments(name),positions(title),employment_contracts(id,title,starts_on,ends_on,salary_amount,currency_code,status)").eq("workspace_id", workspaceId).order("hire_date", { ascending: false }) : Promise.resolve({ data: [] as never[] }),
    workspaceId ? supabase.from("employee_access").select("employee_id,profile_id,access_status,provisioning_method").eq("workspace_id", workspaceId) : Promise.resolve({ data: [] as never[] }),
  ]);
  const rows = employees.data ?? [];
  const accessByEmployee = new Map((accessRows.data ?? []).map((access) => [access.employee_id, access]));
  const managerNames = new Map(rows.map((employee) => [employee.id, `${employee.first_name} ${employee.last_name}`]));

  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">People module</p><h1 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">Employee directory</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Every staff profile carries an automatic Betanor ID, start date, position, salary record, reporting line, portal link, and standard Monday–Friday work schedule.</p></div><Link href="/workspace/leave" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Open leave desk →</Link></div>
    {workspaceId ? <EmployeeManagementPanel
      departments={(departments.data ?? []).map((department) => ({ id: department.id, label: `${department.name} · ${department.code}` }))}
      positions={(positions.data ?? []).map((position) => ({ id: position.id, label: `${position.title}${position.code ? ` · ${position.code}` : ""}` }))}
      profiles={(profiles.data ?? []).map((profile) => ({ id: profile.id, label: `${profile.full_name || "Unnamed profile"}${profile.job_title ? ` · ${profile.job_title}` : ""}` }))}
      managers={rows.map((employee) => ({ id: employee.id, label: `${employee.first_name} ${employee.last_name} · ${employee.employee_number}` }))}
      roles={(roles.data ?? []).map((role) => ({ id: role.code, label: role.name }))}
      employees={rows.map((employee) => { const contracts = employee.employment_contracts ?? []; const currentContract = [...contracts].sort((a, b) => String(b.starts_on).localeCompare(String(a.starts_on)))[0]; const access = accessByEmployee.get(employee.id); return { id: employee.id, profile_id: employee.profile_id, first_name: employee.first_name, last_name: employee.last_name, work_email: employee.work_email, work_phone: employee.work_phone, hire_date: employee.hire_date, probation_end_date: employee.probation_end_date, department_id: employee.department_id, position_id: employee.position_id, manager_id: employee.manager_id, employment_type: employee.employment_type, employment_status: employee.employment_status, contract_title: currentContract?.title || "Employment contract", salary_amount: currentContract?.salary_amount ? Number(currentContract.salary_amount) : null, access_status: access?.access_status ?? null, access_provisioning_method: access?.provisioning_method ?? null, access_profile_id: access?.profile_id ?? null } as EmployeeAdminRecord; })}
      canManage={access.permissions.has("hr.manage") || access.permissions.has("users.manage")}
    /> : <Card className="mt-8 p-6">Employee access is required for this workspace.</Card>}
    <div className="mt-10 flex items-center justify-between"><div><h2 className="text-xl font-semibold text-[var(--betanor-navy)]">All employees</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">{rows.length} profile{rows.length === 1 ? "" : "s"} in this workspace.</p></div></div>
    {rows.length ? <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map((employee) => { const contracts = employee.employment_contracts ?? []; const currentContract = [...contracts].sort((a, b) => String(b.starts_on).localeCompare(String(a.starts_on)))[0]; return <Card key={employee.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><Link href={`/workspace/employees/${employee.id}`} className="font-semibold text-[var(--betanor-navy)] hover:text-[var(--betanor-blue)]">{employee.first_name} {employee.last_name}</Link><p className="mt-1 text-xs font-semibold tracking-wide text-[var(--betanor-blue)]">{employee.employee_number}</p></div><Badge tone={employee.employment_status === "active" ? "success" : "neutral"}>{employee.employment_status}</Badge></div><p className="mt-4 text-sm text-[var(--betanor-text)]">{employee.positions?.[0]?.title || "Position to be assigned"} · {employee.departments?.[0]?.name || "Department to be assigned"}</p><dl className="mt-4 space-y-2 text-xs text-[var(--betanor-muted)]"><div className="flex justify-between gap-3"><dt>Seniority</dt><dd className="font-semibold text-[var(--betanor-navy)]">{seniority(employee.hire_date)}</dd></div><div className="flex justify-between gap-3"><dt>Start date</dt><dd>{employee.hire_date || "Not recorded"}</dd></div><div className="flex justify-between gap-3"><dt>Salary</dt><dd>{currentContract?.salary_amount ? `${currentContract.currency_code} ${Number(currentContract.salary_amount).toLocaleString()}` : "Not recorded"}</dd></div><div className="flex justify-between gap-3"><dt>Manager</dt><dd>{employee.manager_id ? managerNames.get(employee.manager_id) || "Recorded" : "Not recorded"}</dd></div></dl><div className="mt-4 border-t border-[var(--betanor-border)] pt-3 text-xs text-[var(--betanor-muted)]">{employee.work_days_per_week} days · {employee.work_hours_per_day} hours/day · {employee.profile_id ? "Portal linked" : "Portal not linked"} · {employee.work_email || "No work email"}</div></Card>; })}</div> : <Card className="mt-4 p-8"><p className="font-semibold text-[var(--betanor-navy)]">No employee profiles yet.</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">HR can create the first profile above. The database will generate the employee ID.</p></Card>}
  </main>;
}
