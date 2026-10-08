import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.hasStaffRole || !access.permissions.has("chat.manage")) {
    return NextResponse.json({ error: "Chat management access is required." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }

  const canShareWork = ["task.create", "task.edit", "task.assign", "project.manage"].some((permission) => access.permissions.has(permission));
  const [projects, tasks, employees] = await Promise.all([
    canShareWork ? supabase.from("projects").select("id,name,project_code").eq("workspace_id", access.workspaceId).order("created_at", { ascending: false }).limit(60) : Promise.resolve({ data: [] as Array<{ id: string; name: string; project_code: string | null }>, error: null }),
    canShareWork ? supabase.from("tasks").select("id,title,task_code").eq("workspace_id", access.workspaceId).order("created_at", { ascending: false }).limit(60) : Promise.resolve({ data: [] as Array<{ id: string; title: string; task_code: string | null }>, error: null }),
    access.permissions.has("task.assign") ? supabase.from("employees").select("id,first_name,last_name,employee_number").eq("workspace_id", access.workspaceId).eq("employment_status", "active").not("profile_id", "is", null).order("first_name").limit(200) : Promise.resolve({ data: [] as Array<{ id: string; first_name: string; last_name: string; employee_number: string | null }>, error: null }),
  ]);
  if (projects.error || tasks.error || employees.error) {
    return NextResponse.json({ error: "Chat work options could not be loaded." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json({ projects: projects.data ?? [], tasks: tasks.data ?? [], employees: employees.data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
