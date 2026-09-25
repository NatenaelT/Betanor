import { NextResponse } from "next/server";

import { audit, allocateReference, companyDate, hasAnyPermission, letterAuth, normalizeDraft, createVersion } from "@/lib/letters/server";
import { LETTER_COLUMNS } from "@/lib/letters/types";
import type { LetterRecord } from "@/lib/letters/types";

export const dynamic = "force-dynamic";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function jsonError(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }

export async function GET(request: Request) {
  const { supabase, access } = await letterAuth();
  if (!access.workspaceId || !hasAnyPermission(access, ["letters.read", "letters.view_department", "letters.view_all"])) return jsonError("Letter access is required.", 403);
  const url = new URL(request.url); const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1); const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") || 20) || 20)); const search = text(url.searchParams.get("search")).replace(/[,%()]/g, " ");
  let query = supabase.from("letters").select("id,reference_number,letter_date,letter_type,department_id,prepared_by,recipient_name,recipient_organization,subject,status,created_at,updated_at", { count: "exact" }).eq("workspace_id", access.workspaceId).order("updated_at", { ascending: false });
  if (search) query = query.or(`reference_number.ilike.%${search}%,subject.ilike.%${search}%,recipient_name.ilike.%${search}%,recipient_organization.ilike.%${search}%`);
  const status = text(url.searchParams.get("status")); if (["DRAFT", "PUBLISHED", "SUBMITTED"].includes(status)) query = query.eq("status", status);
  const departmentId = text(url.searchParams.get("departmentId")); if (departmentId) query = query.eq("department_id", departmentId);
  const preparedBy = text(url.searchParams.get("preparedBy")); if (preparedBy) query = query.eq("prepared_by", preparedBy);
  const letterType = text(url.searchParams.get("letterType")); if (letterType) query = query.eq("letter_type", letterType);
  const recipientOrganization = text(url.searchParams.get("recipientOrganization")); if (recipientOrganization) query = query.ilike("recipient_organization", `%${recipientOrganization}%`);
  const dateFrom = text(url.searchParams.get("dateFrom")); if (dateFrom) query = query.gte("letter_date", dateFrom);
  const dateTo = text(url.searchParams.get("dateTo")); if (dateTo) query = query.lte("letter_date", dateTo);
  const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return jsonError(error.message);
  const rows = data ?? []; const departmentIds = rows.map((row) => row.department_id).filter(Boolean) as string[]; const profileIds = rows.map((row) => row.prepared_by).filter(Boolean) as string[];
  const [{ data: departments }, { data: profiles }] = await Promise.all([
    departmentIds.length ? supabase.from("departments").select("id,name,code").in("id", departmentIds) : Promise.resolve({ data: [] as { id: string; name: string; code: string }[] }),
    profileIds.length ? supabase.from("profiles").select("id,full_name").in("id", profileIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);
  const departmentMap = new Map((departments ?? []).map((item) => [item.id, item])); const profileMap = new Map((profiles ?? []).map((item) => [item.id, item]));
  return NextResponse.json({ data: rows.map((row) => ({ ...row, department: row.department_id ? departmentMap.get(row.department_id) ?? null : null, prepared_by_profile: profileMap.get(row.prepared_by) ?? null })), page, pageSize, total: count ?? 0, totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)) });
}

export async function POST(request: Request) {
  const { supabase, access } = await letterAuth();
  if (!access.workspaceId || !access.userId || !access.permissions.has("letters.create")) return jsonError("You do not have permission to create letters.", 403);
  const body = await request.json().catch(() => ({})); const draft = normalizeDraft(body);
  if (draft.recipient_organization.length < 2 || draft.subject.length < 2 || draft.signatory.length < 2) return jsonError("Organization, subject, and signatory are required.", 422);
  if (draft.body_html.replace(/<[^>]+>/g, "").trim().length < 2) return jsonError("A letter body is required.", 422);
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.letter_date || "") ? draft.letter_date as string : companyDate(access.workspace?.timezone);
  const letterDate = access.permissions.has("letters.edit_all") ? requestedDate : companyDate(access.workspace?.timezone);
  const { reference, error: referenceError } = await allocateReference(supabase, access.workspaceId, letterDate, draft.department_id);
  if (referenceError || !reference) return jsonError(referenceError?.message || "Could not allocate a unique letter reference.", 409);
  const { data: letter, error } = await supabase.from("letters").insert({ ...draft, letter_date: letterDate, reference_number: reference, workspace_id: access.workspaceId, prepared_by: access.userId, status: "DRAFT" }).select(LETTER_COLUMNS).single();
  if (error || !letter) return jsonError(error?.message || "Could not save the letter draft.");
  await createVersion(supabase, letter as unknown as LetterRecord, "CREATED", access.userId); await audit(supabase, access.workspaceId, (letter as unknown as LetterRecord).id, "letter.created", { reference_number: reference });
  return NextResponse.json({ letter }, { status: 201 });
}
