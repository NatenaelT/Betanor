import { NextResponse } from "next/server";

import { deliverPortalEmail, emailAuth, normalizeAddresses } from "@/lib/emails/server";

export const dynamic = "force-dynamic";

type RelatedModule = "letters" | "projects" | "tasks" | "tenders" | "quotations" | "contracts" | "rfqs" | "customers" | "support_tickets" | "employees" | "other";
type RelatedInput = { module: RelatedModule; recordId: string; recordLabel?: string };

async function verifyRelatedRecord(supabase: Awaited<ReturnType<typeof emailAuth>>["supabase"], module: RelatedModule, id: string, workspaceId: string) {
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

export async function GET(request: Request) {
  const { supabase, access } = await emailAuth();
  if (!access.workspaceId || !access.permissions.has("email.read") && !access.permissions.has("email.read_all")) {
    return NextResponse.json({ error: "Email read permission is required." }, { status: 403 });
  }
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") || 20) || 20));
  const status = url.searchParams.get("status");
  const search = (url.searchParams.get("search") || "").trim().replace(/[,%()]/g, " ").slice(0, 80);
  let query = supabase.from("email_messages")
    .select("id,sender_profile_id,sender_email,sender_name,to_addresses,cc_addresses,subject,status,sent_at,created_at", { count: "exact" })
    .eq("workspace_id", access.workspaceId)
    .order("created_at", { ascending: false });
  if (status && ["DRAFT", "SENT", "FAILED"].includes(status)) query = query.eq("status", status);
  if (search) query = query.or(`subject.ilike.%${search}%,sender_email.ilike.%${search}%`);
  const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const messages = data ?? [];
  const messageIds = messages.map((message) => message.id);
  const { data: links } = messageIds.length
    ? await supabase.from("email_message_links").select("email_message_id,module,record_id,record_label").in("email_message_id", messageIds)
    : { data: [] as { email_message_id: string; module: string; record_id: string; record_label: string }[] };
  const linkMap = new Map<string, typeof links>();
  for (const link of links ?? []) linkMap.set(link.email_message_id, [...(linkMap.get(link.email_message_id) ?? []), link]);
  return NextResponse.json({
    data: messages.map((message) => ({ ...message, links: linkMap.get(message.id) ?? [] })),
    page,
    pageSize,
    total: count ?? 0,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  });
}

export async function POST(request: Request) {
  const { supabase, access } = await emailAuth();
  if (!access.workspaceId || !access.userId) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!access.hasStaffRole || !access.permissions.has("email.send")) return NextResponse.json({ error: "Staff email access is required." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  let toAddresses: string[];
  let ccAddresses: string[];
  try {
    toAddresses = normalizeAddresses(body.to);
    ccAddresses = normalizeAddresses(body.cc);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Check the email addresses." }, { status: 422 });
  }
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 250) : "";
  const bodyText = typeof body.body === "string" ? body.body.trim().slice(0, 50_000) : "";
  if (!toAddresses.length || !subject || !bodyText) {
    return NextResponse.json({ error: "Add at least one recipient, a subject, and a message." }, { status: 422 });
  }
  const related: RelatedInput[] = Array.isArray(body.related) ? body.related.slice(0, 10) : [];
  for (const item of related) {
    if (!item || !["letters", "projects", "tasks", "tenders", "quotations", "contracts", "rfqs", "customers", "support_tickets", "employees", "other"].includes(item.module)) {
      return NextResponse.json({ error: "A related record type is not supported." }, { status: 422 });
    }
    const moduleName = item.module;
    const record = await verifyRelatedRecord(supabase, moduleName, item.recordId, access.workspaceId);
    if (!record) return NextResponse.json({ error: "A linked record is unavailable or outside your access." }, { status: 404 });
    item.recordLabel = record.label;
  }

  const [{ data: profile }, { data: authUser }] = await Promise.all([
    supabase.from("profiles").select("full_name,email_address").eq("id", access.userId).eq("workspace_id", access.workspaceId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const senderEmail = profile?.email_address?.trim().toLowerCase() || authUser.user?.email?.trim().toLowerCase();
  if (!senderEmail) return NextResponse.json({ error: "Add a work email address to your staff profile before sending." }, { status: 422 });
  const allAddresses = [...new Set([...toAddresses, ...ccAddresses])];
  const { data: staffProfiles } = await supabase.from("profiles").select("id,email_address")
    .eq("workspace_id", access.workspaceId).eq("is_active", true).in("email_address", allAddresses);
  const participants = [...new Set([access.userId, ...(staffProfiles ?? []).map((person) => person.id)])];
  const action = body.action === "send" ? "send" : "draft";
  const parentMessageId = typeof body.parentMessageId === "string" ? body.parentMessageId : null;

  const { data: message, error: insertError } = await supabase.from("email_messages").insert({
    workspace_id: access.workspaceId,
    sender_profile_id: access.userId,
    sender_email: senderEmail,
    sender_name: profile?.full_name?.trim() || senderEmail,
    to_addresses: toAddresses,
    cc_addresses: ccAddresses,
    participant_profile_ids: participants,
    subject,
    body_text: bodyText,
    body_html: `<p>${bodyText.split(/\r?\n/).map((line: string) => line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")).join("<br/>")}</p>`,
    status: "DRAFT",
    parent_message_id: parentMessageId,
  }).select("id").single();
  if (insertError || !message) return NextResponse.json({ error: insertError?.message || "The email draft could not be saved." }, { status: 400 });

  if (related.length) {
    const { error: linkError } = await supabase.from("email_message_links").insert(related.map((item) => ({
      workspace_id: access.workspaceId!,
      email_message_id: message.id,
      module: item.module,
      record_id: item.recordId,
      record_label: item.recordLabel || "Related business record",
      created_by: access.userId!,
    })));
    if (linkError) return NextResponse.json({ error: linkError.message, id: message.id }, { status: 400 });
  }
  if (action === "draft") return NextResponse.json({ id: message.id, status: "DRAFT" }, { status: 201 });

  try {
    const sent = await deliverPortalEmail({
      to: toAddresses,
      cc: ccAddresses,
      subject,
      body: bodyText,
      replyTo: senderEmail,
    });
    if (!sent.configured) {
      return NextResponse.json({
        id: message.id,
        status: "DRAFT",
        error: "The message is saved as a draft, but SMTP delivery is not configured for the portal yet.",
      }, { status: 503 });
    }
    const { error: sentUpdateError } = await supabase.from("email_messages")
      .update({ status: "SENT", provider_message_id: sent.messageId, sent_at: new Date().toISOString(), delivery_error: null })
      .eq("id", message.id)
      .eq("status", "DRAFT");
    if (sentUpdateError) return NextResponse.json({ id: message.id, status: "SENT", error: "Email was accepted by the mail server but its portal log could not be updated." }, { status: 202 });
    return NextResponse.json({ id: message.id, status: "SENT" }, { status: 201 });
  } catch (error) {
    const { error: updateError } = await supabase.from("email_messages")
      .update({ status: "FAILED", delivery_error: "SMTP delivery failed. Check the mail server settings and retry." })
      .eq("id", message.id)
      .eq("status", "DRAFT");
    console.error("Betanor outbound email delivery failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({
      id: message.id,
      status: updateError ? "DRAFT" : "FAILED",
      error: "The message could not be delivered. It has been kept in the email register.",
    }, { status: 502 });
  }
}
