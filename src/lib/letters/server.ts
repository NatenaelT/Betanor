import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";
import { letterContentHash } from "@/lib/letters/pdf";
import { sanitizeLetterHtml } from "@/lib/letters/sanitize";
import type { LetterDraftInput, LetterRecord, LetterStatus } from "@/lib/letters/types";

export async function letterAuth() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  return { supabase, access };
}

export function hasAnyPermission(access: Awaited<ReturnType<typeof resolveWorkspace>>, permissions: string[]) {
  return permissions.some((permission) => access.permissions.has(permission));
}

export function companyDate(timezone?: string | null) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "Africa/Addis_Ababa", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch { return new Date().toISOString().slice(0, 10); }
}

export function cleanText(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback; }

export function normalizeDraft(input: LetterDraftInput) {
  const tags = Array.isArray(input.tags) ? input.tags.map((tag) => cleanText(tag)).filter(Boolean).slice(0, 30) : [];
  return {
    letter_date: cleanText(input.letter_date) || null,
    letter_type: cleanText(input.letter_type) || "General Letter",
    department_id: cleanText(input.department_id) || null,
    approved_by: cleanText(input.approved_by) || null,
    recipient_name: cleanText(input.recipient_name),
    recipient_title: cleanText(input.recipient_title) || null,
    recipient_organization: cleanText(input.recipient_organization),
    recipient_address: cleanText(input.recipient_address) || null,
    recipient_email: cleanText(input.recipient_email) || null,
    cc: cleanText(input.cc) || null,
    subject: cleanText(input.subject),
    salutation: cleanText(input.salutation) || "Dear Sir/Madam,",
    body_html: sanitizeLetterHtml(input.body_html),
    closing: cleanText(input.closing) || "Yours faithfully,",
    signatory: cleanText(input.signatory),
    signatory_title: cleanText(input.signatory_title) || null,
    internal_notes: cleanText(input.internal_notes) || null,
    tags,
    customer_id: cleanText(input.customer_id) || null,
    employee_id: cleanText(input.employee_id) || null,
    tender_id: cleanText(input.tender_id) || null,
    project_id: cleanText(input.project_id) || null,
    contract_id: cleanText(input.contract_id) || null,
    quotation_id: cleanText(input.quotation_id) || null,
    rfq_id: cleanText(input.rfq_id) || null,
  };
}

export function validateLetter(letter: Partial<LetterRecord>) {
  const missing: string[] = [];
  if (!cleanText(letter.recipient_name)) missing.push("recipient name");
  if (!cleanText(letter.recipient_organization)) missing.push("recipient organization");
  if (!cleanText(letter.subject)) missing.push("subject");
  if (!cleanText(letter.body_html).replace(/<[^>]+>/g, "").trim()) missing.push("letter body");
  if (!cleanText(letter.salutation)) missing.push("salutation");
  if (!cleanText(letter.closing)) missing.push("closing");
  if (!cleanText(letter.signatory)) missing.push("signatory");
  return missing;
}

export async function getLetter(supabase: SupabaseClient, workspaceId: string, id: string) {
  const { data, error } = await supabase.from("letters").select("*").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  return { letter: data as LetterRecord | null, error };
}

export async function allocateReference(supabase: SupabaseClient, workspaceId: string, letterDate: string, departmentId?: string | null) {
  const { data, error } = await supabase.rpc("allocate_letter_reference", { p_workspace_id: workspaceId, p_letter_date: letterDate, p_department_id: departmentId || null, p_prefix: "BTNR/LET" });
  const row = Array.isArray(data) ? data[0] : data;
  return { reference: row?.reference_number as string | undefined, error };
}

export async function createVersion(supabase: SupabaseClient, letter: LetterRecord, type: "CREATED" | "EDITED" | "PUBLISHED" | "SUBMITTED", actorId: string) {
  const { data: latest } = await supabase.from("letter_versions").select("version_number").eq("letter_id", letter.id).order("version_number", { ascending: false }).limit(1).maybeSingle();
  const snapshot = { ...letter, status: type === "SUBMITTED" ? "SUBMITTED" : letter.status };
  const { error } = await supabase.from("letter_versions").insert({ letter_id: letter.id, version_number: Number(latest?.version_number ?? 0) + 1, version_type: type, snapshot, content_hash: letterContentHash(letter), created_by: actorId });
  return error;
}

export async function audit(supabase: SupabaseClient, workspaceId: string, letterId: string, action: string, payload: Record<string, unknown> = {}) {
  await supabase.rpc("record_letter_audit", { p_workspace_id: workspaceId, p_letter_id: letterId, p_action: action, p_payload: payload });
}

export async function notify(supabase: SupabaseClient, workspaceId: string, type: string, title: string, body: string, letterId: string) {
  // The notification row is the durable hand-off. Email/Telegram workers can
  // consume it asynchronously, so a slow provider never blocks a submission.
  await supabase.rpc("enqueue_letter_notification", { p_workspace_id: workspaceId, p_type: type, p_title: title, p_body: body, p_entity_id: letterId, p_recipient_ids: null });
}

export function canTransition(from: LetterStatus, to: LetterStatus) {
  return from === to || (from === "DRAFT" && to === "PUBLISHED") || (from === "PUBLISHED" && to === "SUBMITTED");
}
