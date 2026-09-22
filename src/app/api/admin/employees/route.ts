import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function canManage(access: Awaited<ReturnType<typeof resolveWorkspace>>) {
  return access.permissions.has("hr.manage") || access.permissions.has("users.manage");
}

async function context() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  return { supabase, access };
}

function employeePayload(body: Record<string, unknown>, workspaceId: string) {
  const firstName = text(body.firstName);
  const lastName = text(body.lastName);
  const hireDate = text(body.hireDate);
  if (firstName.length < 2 || lastName.length < 2 || !hireDate) {
    return { error: "First name, last name, and start date are required." } as const;
  }
  return {
    value: {
      workspace_id: workspaceId,
      profile_id: text(body.profileId) || null,
      first_name: firstName,
      last_name: lastName,
      work_email: text(body.workEmail).toLowerCase() || null,
      work_phone: text(body.workPhone) || null,
      hire_date: hireDate,
      department_id: text(body.departmentId) || null,
      position_id: text(body.positionId) || null,
      manager_id: text(body.managerId) || null,
      employment_type: text(body.employmentType) || "full_time",
      probation_end_date: text(body.probationEndDate) || null,
      work_hours_per_day: 8,
      work_days_per_week: 5,
      employment_status: text(body.employmentStatus) || "active",
    },
  } as const;
}

async function saveContract(supabase: Awaited<ReturnType<typeof createClient>>, employeeId: string, body: Record<string, unknown>, hireDate: string) {
  const title = text(body.contractTitle) || "Employment contract";
  const salary = Number(body.salary ?? 0);
  const { data: current } = await supabase.from("employment_contracts").select("id").eq("employee_id", employeeId).order("starts_on", { ascending: false }).limit(1).maybeSingle();
  if (current?.id) {
    await supabase.from("employment_contracts").update({ title, starts_on: hireDate, salary_amount: Number.isFinite(salary) && salary > 0 ? salary : null, currency_code: "ETB", updated_at: new Date().toISOString() }).eq("id", current.id);
  } else if (Number.isFinite(salary) && salary > 0) {
    await supabase.from("employment_contracts").insert({ employee_id: employeeId, contract_number: `BTNR-CTR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`, title, starts_on: hireDate, salary_amount: salary, currency_code: "ETB", status: "draft" });
  }
}

export async function POST(request: Request) {
  const { supabase, access } = await context();
  if (!access.workspaceId || !canManage(access)) return NextResponse.json({ error: "Employee administration access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const payload = employeePayload(body, access.workspaceId);
  if ("error" in payload) return NextResponse.json({ error: payload.error }, { status: 422 });
  const { data: employee, error } = await supabase.from("employees").insert(payload.value).select("id,employee_number").single();
  if (error || !employee) return NextResponse.json({ error: error?.message || "Could not create the employee." }, { status: 400 });
  await saveContract(supabase, employee.id, body, payload.value.hire_date);
  return NextResponse.json({ employee }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { supabase, access } = await context();
  if (!access.workspaceId || !canManage(access)) return NextResponse.json({ error: "Employee administration access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body.id);
  if (!id) return NextResponse.json({ error: "An employee is required." }, { status: 422 });
  const payload = employeePayload(body, access.workspaceId);
  if ("error" in payload) return NextResponse.json({ error: payload.error }, { status: 422 });
  const { data: employee, error } = await supabase.from("employees").update(payload.value).eq("id", id).eq("workspace_id", access.workspaceId).select("id,employee_number").maybeSingle();
  if (error || !employee) return NextResponse.json({ error: error?.message || "Employee not found." }, { status: 404 });
  await saveContract(supabase, employee.id, body, payload.value.hire_date);
  return NextResponse.json({ employee });
}

export async function DELETE(request: Request) {
  const { supabase, access } = await context();
  if (!access.workspaceId || !canManage(access)) return NextResponse.json({ error: "Employee administration access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body.id);
  if (!id) return NextResponse.json({ error: "An employee is required." }, { status: 422 });
  const [{ count: leaveCount }, { count: payslipCount }, { count: taskCount }, { data: employeeAccess }] = await Promise.all([
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("employee_id", id),
    supabase.from("payslips").select("id", { count: "exact", head: true }).eq("employee_id", id),
    supabase.from("task_assignees").select("task_id", { count: "exact", head: true }).eq("employee_id", id),
    supabase.from("employee_access").select("id,access_status").eq("employee_id", id).eq("workspace_id", access.workspaceId).maybeSingle(),
  ]);
  const hasHistory = (leaveCount ?? 0) + (payslipCount ?? 0) + (taskCount ?? 0) > 0;
  if (employeeAccess?.id) {
    if (employeeAccess.access_status !== "employment_ended") {
      const { error: accessError } = await supabase.functions.invoke("admin-user-management", {
        body: { action: "employee_access", employeeId: id, accessAction: "set_status", status: "employment_ended" },
      });
      if (accessError) return NextResponse.json({ error: "The employee was not archived because account access could not be disabled." }, { status: 502 });
    }
  }
  if (hasHistory || employeeAccess?.id) {
    const { error } = await supabase.from("employees").update({ employment_status: "archived", updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", access.workspaceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ archived: true, message: employeeAccess?.id ? "The employee was archived and platform access was ended." : "The employee has history, so the record was archived instead of destroying payroll or leave data." });
  }
  const { error } = await supabase.from("employees").delete().eq("id", id).eq("workspace_id", access.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ deleted: true });
}
