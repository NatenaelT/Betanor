import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

export async function GET(request: Request) {
  const supabase = await createClient(); const access = await resolveWorkspace(supabase); if (!access.workspaceId || !access.permissions.has("tender.read") && !access.permissions.has("tender.view_all")) return NextResponse.json({ error: "Tender access is required." }, { status: 403 });
  const url = new URL(request.url); const page = Math.max(1, Number(url.searchParams.get("page") || 1)); const term = clean(url.searchParams.get("search")); let query = supabase.from("tenders").select("id,reference_number,title,procuring_organization,status,submission_deadline,estimated_value,currency_code,owner_id,updated_at", { count: "exact" }).eq("workspace_id", access.workspaceId).order("submission_deadline", { ascending: true, nullsFirst: false }); if (term) query = query.or(`reference_number.ilike.%${term}%,title.ilike.%${term}%,procuring_organization.ilike.%${term}%`); const { data, error, count } = await query.range((page - 1) * 25, page * 25 - 1); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ tenders: data ?? [], count: count ?? 0, page });
}

export async function POST(request: Request) {
  const supabase = await createClient(); const access = await resolveWorkspace(supabase); if (!access.workspaceId || !access.userId || !access.permissions.has("tender.create")) return NextResponse.json({ error: "Tender creation permission is required." }, { status: 403 }); const body = await request.json().catch(() => ({})); const title = clean(body.title); if (title.length < 3) return NextResponse.json({ error: "Tender title is required." }, { status: 422 }); const reference = clean(body.referenceNumber) || `BTNR-TND-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`; const { data, error } = await supabase.from("tenders").insert({ workspace_id: access.workspaceId, reference_number: reference, title, procuring_organization: clean(body.procuringOrganization) || null, description: clean(body.description) || null, tender_type: clean(body.tenderType) || null, currency_code: clean(body.currencyCode) || "ETB", estimated_value: Number(body.estimatedValue) || null, issue_date: clean(body.issueDate) || null, submission_deadline: clean(body.submissionDeadline) || null, owner_id: access.userId, created_by: access.userId, department_id: clean(body.departmentId) || null }).select("*").single(); if (error) return NextResponse.json({ error: error.message }, { status: error.code === "23505" ? 409 : 400 }); return NextResponse.json({ tender: data }, { status: 201 });
}
