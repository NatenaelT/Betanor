import type { SupabaseClient } from "@supabase/supabase-js";

export type EmailRelatedModule = "letters" | "projects" | "tasks" | "tenders" | "quotations" | "contracts" | "rfqs" | "customers" | "support_tickets" | "employees" | "other";

export async function verifyEmailRelatedRecord(supabase: SupabaseClient, module: EmailRelatedModule, id: string, workspaceId: string) {
  switch (module) {
    case "letters": {
      const { data } = await supabase.from("letters").select("id,reference_number,subject").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      return data ? { label: `${data.reference_number} · ${data.subject}` } : null;
    }
    case "projects": {
      const { data } = await supabase.from("projects").select("id,project_code,name").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      return data ? { label: `${data.project_code} · ${data.name}` } : null;
    }
    case "tasks": {
      const { data } = await supabase.from("tasks").select("id,task_code,title").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      return data ? { label: `${data.task_code || "Task"} · ${data.title}` } : null;
    }
    case "tenders": {
      const { data } = await supabase.from("tenders").select("id,reference_number,title").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      return data ? { label: `${data.reference_number} · ${data.title}` } : null;
    }
    case "quotations": {
      const { data } = await supabase.from("quotations").select("id,quotation_number,title").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      return data ? { label: `${data.quotation_number} · ${data.title}` } : null;
    }
    case "contracts": {
      const { data } = await supabase.from("contracts").select("id,contract_number,title").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      return data ? { label: `${data.contract_number} · ${data.title}` } : null;
    }
    case "rfqs": {
      const { data } = await supabase.from("rfq_requests").select("id,reference,organization").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      return data ? { label: `${data.reference} · ${data.organization || "Customer request"}` } : null;
    }
    case "customers": {
      const { data } = await supabase.from("customers").select("id,name").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      return data ? { label: data.name } : null;
    }
    case "support_tickets": {
      const { data } = await supabase.from("support_tickets").select("id,ticket_number,title").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      return data ? { label: `${data.ticket_number} · ${data.title}` } : null;
    }
    case "employees": {
      const { data } = await supabase.from("employees").select("id,employee_number,first_name,last_name").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
      return data ? { label: `${data.employee_number} · ${data.first_name} ${data.last_name}` } : null;
    }
    default:
      return { label: "Related business record" };
  }
}
