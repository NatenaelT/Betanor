import { NextResponse } from "next/server";

import { emailAuth } from "@/lib/emails/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { supabase, access } = await emailAuth();
  if (!access.workspaceId || !access.permissions.has("email.send")) {
    return NextResponse.json({ error: "Email send permission is required." }, { status: 403 });
  }
  const url = new URL(request.url);
  const moduleName = url.searchParams.get("module") || "";
  const term = (url.searchParams.get("q") || "").trim().replace(/[,%()]/g, " ").slice(0, 60);
  let options: { id: string; module: string; label: string }[] = [];

  if (moduleName === "letters" && (access.permissions.has("letters.read") || access.permissions.has("letters.view_all"))) {
    let query = supabase.from("letters").select("id,reference_number,subject").eq("workspace_id", access.workspaceId).order("updated_at", { ascending: false }).limit(12);
    if (term) query = query.ilike("subject", `%${term}%`);
    const { data } = await query;
    options = (data ?? []).map((row) => ({ id: row.id, module: moduleName, label: `${row.reference_number} · ${row.subject}` }));
  } else if (moduleName === "projects" && (access.permissions.has("project.manage") || access.permissions.has("project.read"))) {
    let query = supabase.from("projects").select("id,project_code,name").eq("workspace_id", access.workspaceId).order("updated_at", { ascending: false }).limit(12);
    if (term) query = query.ilike("name", `%${term}%`);
    const { data } = await query;
    options = (data ?? []).map((row) => ({ id: row.id, module: moduleName, label: `${row.project_code} · ${row.name}` }));
  } else if (moduleName === "tasks" && (access.permissions.has("task.create") || access.permissions.has("task.assign") || access.permissions.has("task.edit"))) {
    let query = supabase.from("tasks").select("id,task_code,title").eq("workspace_id", access.workspaceId).order("updated_at", { ascending: false }).limit(12);
    if (term) query = query.ilike("title", `%${term}%`);
    const { data } = await query;
    options = (data ?? []).map((row) => ({ id: row.id, module: moduleName, label: `${row.task_code || "Task"} · ${row.title}` }));
  } else if (moduleName === "tenders" && access.permissions.has("tender.read")) {
    let query = supabase.from("tenders").select("id,reference_number,title").eq("workspace_id", access.workspaceId).order("updated_at", { ascending: false }).limit(12);
    if (term) query = query.ilike("title", `%${term}%`);
    const { data } = await query;
    options = (data ?? []).map((row) => ({ id: row.id, module: moduleName, label: `${row.reference_number} · ${row.title}` }));
  } else if (moduleName === "quotations" && access.permissions.has("quotation.create")) {
    let query = supabase.from("quotations").select("id,quotation_number,title").eq("workspace_id", access.workspaceId).order("updated_at", { ascending: false }).limit(12);
    if (term) query = query.ilike("title", `%${term}%`);
    const { data } = await query;
    options = (data ?? []).map((row) => ({ id: row.id, module: moduleName, label: `${row.quotation_number} · ${row.title}` }));
  } else if (moduleName === "contracts" && access.permissions.has("contract.create")) {
    let query = supabase.from("contracts").select("id,contract_number,title").eq("workspace_id", access.workspaceId).order("created_at", { ascending: false }).limit(12);
    if (term) query = query.ilike("title", `%${term}%`);
    const { data } = await query;
    options = (data ?? []).map((row) => ({ id: row.id, module: moduleName, label: `${row.contract_number} · ${row.title}` }));
  } else if (moduleName === "rfqs" && access.permissions.has("rfq.read")) {
    let query = supabase.from("rfq_requests").select("id,reference,organization").eq("workspace_id", access.workspaceId).order("created_at", { ascending: false }).limit(12);
    if (term) query = query.ilike("reference", `%${term}%`);
    const { data } = await query;
    options = (data ?? []).map((row) => ({ id: row.id, module: moduleName, label: `${row.reference} · ${row.organization || "Customer request"}` }));
  } else if (moduleName === "customers" && access.permissions.has("crm.read")) {
    let query = supabase.from("customers").select("id,name").eq("workspace_id", access.workspaceId).order("name").limit(12);
    if (term) query = query.ilike("name", `%${term}%`);
    const { data } = await query;
    options = (data ?? []).map((row) => ({ id: row.id, module: moduleName, label: row.name }));
  } else if (moduleName === "support_tickets" && access.permissions.has("support.read")) {
    let query = supabase.from("support_tickets").select("id,ticket_number,title").eq("workspace_id", access.workspaceId).order("created_at", { ascending: false }).limit(12);
    if (term) query = query.ilike("title", `%${term}%`);
    const { data } = await query;
    options = (data ?? []).map((row) => ({ id: row.id, module: moduleName, label: `${row.ticket_number} · ${row.title}` }));
  } else if (moduleName === "employees" && access.permissions.has("hr.read")) {
    let query = supabase.from("employees").select("id,employee_number,first_name,last_name").eq("workspace_id", access.workspaceId).eq("employment_status", "active").order("first_name").limit(12);
    if (term) query = query.ilike("first_name", `%${term}%`);
    const { data } = await query;
    options = (data ?? []).map((row) => ({ id: row.id, module: moduleName, label: `${row.employee_number} · ${row.first_name} ${row.last_name}` }));
  }
  return NextResponse.json({ options });
}
