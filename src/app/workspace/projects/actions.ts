"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

const allowedProjectStatuses = new Set(["not_started", "in_progress", "blocked", "completed", "cancelled"]);

function value(data: FormData, key: string) {
  return String(data.get(key) ?? "").trim();
}

async function projectAdmin() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.isActive || !access.hasStaffRole || !access.permissions.has("project.manage") || !access.workspaceId) {
    redirect("/workspace/projects?error=access");
  }
  return { supabase, access };
}

function projectDates(data: FormData) {
  const startsOn = value(data, "startsOn") || null;
  const endsOn = value(data, "endsOn") || null;
  if (startsOn && endsOn && endsOn < startsOn) return null;
  return { starts_on: startsOn, ends_on: endsOn };
}

function budgetValue(data: FormData) {
  const raw = value(data, "budget");
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

export async function createProject(data: FormData) {
  const { supabase, access } = await projectAdmin();
  const name = value(data, "name");
  const dates = projectDates(data);
  const budget = budgetValue(data);
  if (!name || !dates || budget === undefined) redirect("/workspace/projects?error=validation");

  const { error } = await supabase.from("projects").insert({
    workspace_id: access.workspaceId,
    project_code: `BTNR-PRJ-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`,
    name,
    customer_id: value(data, "customerId") || null,
    contract_id: value(data, "contractId") || null,
    department_id: value(data, "departmentId") || null,
    project_manager_id: value(data, "projectManagerId") || null,
    description: value(data, "description") || null,
    ...dates,
    budget_amount: budget,
    currency_code: value(data, "currencyCode").toUpperCase() || "ETB",
  });
  if (error) redirect("/workspace/projects?error=create");

  revalidatePath("/workspace/projects");
  redirect("/workspace/projects");
}

export async function updateProject(data: FormData) {
  const { supabase, access } = await projectAdmin();
  const projectId = value(data, "projectId");
  const name = value(data, "name");
  const status = value(data, "status");
  const dates = projectDates(data);
  const budget = budgetValue(data);
  if (!projectId || !name || !dates || budget === undefined || !allowedProjectStatuses.has(status)) {
    redirect(`/workspace/projects/${encodeURIComponent(projectId)}?error=validation`);
  }

  const { error } = await supabase.from("projects").update({
    name,
    description: value(data, "description") || null,
    customer_id: value(data, "customerId") || null,
    contract_id: value(data, "contractId") || null,
    department_id: value(data, "departmentId") || null,
    project_manager_id: value(data, "projectManagerId") || null,
    status,
    ...dates,
    budget_amount: budget,
    currency_code: value(data, "currencyCode").toUpperCase() || "ETB",
  }).eq("id", projectId).eq("workspace_id", access.workspaceId);
  if (error) redirect(`/workspace/projects/${encodeURIComponent(projectId)}?error=update`);

  revalidatePath("/workspace/projects");
  revalidatePath(`/workspace/projects/${projectId}`);
  redirect(`/workspace/projects/${projectId}`);
}

export async function deleteProject(data: FormData) {
  const { supabase, access } = await projectAdmin();
  const projectId = value(data, "projectId");
  if (!projectId) redirect("/workspace/projects?error=delete");

  const { data: deleted, error } = await supabase.from("projects")
    .delete()
    .eq("id", projectId)
    .eq("workspace_id", access.workspaceId)
    .select("id")
    .maybeSingle();
  if (error || !deleted) redirect(`/workspace/projects/${encodeURIComponent(projectId)}?error=delete`);

  revalidatePath("/workspace/projects");
  revalidatePath("/workspace/tasks");
  redirect("/workspace/projects?deleted=1");
}
