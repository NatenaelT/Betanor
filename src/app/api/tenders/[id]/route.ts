import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

const tenderStatuses = new Set([
  "DRAFT",
  "GO_NO_GO",
  "IN_PROGRESS",
  "READY_FOR_SUBMISSION",
  "SUBMITTED",
  "UNDER_EVALUATION",
  "AWARDED",
  "LOST",
  "CANCELLED",
]);

type PatchBody = Record<string, unknown>;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value: string, dateOnly = false) {
  if (!value) return true;
  if (dateOnly && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.isActive || !access.workspaceId || !access.permissions.has("tender.edit")) {
    return NextResponse.json({ error: "Tender edit permission is required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const patch: Record<string, unknown> = {};
  const optionalTextFields = ["procuring_organization", "description", "tender_type"] as const;

  if ("reference_number" in body) {
    const referenceNumber = clean(body.reference_number);
    if (!referenceNumber || referenceNumber.length > 120) {
      return NextResponse.json({ error: "Enter a valid tender reference number." }, { status: 422 });
    }
    patch.reference_number = referenceNumber;
  }

  if ("title" in body) {
    const title = clean(body.title);
    if (title.length < 3 || title.length > 300) {
      return NextResponse.json({ error: "Tender title must contain 3 to 300 characters." }, { status: 422 });
    }
    patch.title = title;
  }

  for (const key of optionalTextFields) {
    if (key in body) {
      const value = clean(body[key]);
      patch[key] = value || null;
    }
  }

  if ("status" in body) {
    const status = clean(body.status).toUpperCase();
    if (!tenderStatuses.has(status) || status === "SUBMITTED") {
      return NextResponse.json({ error: "Choose a valid tender status." }, { status: 422 });
    }
    patch.status = status;
  }

  if ("currency_code" in body) {
    const currencyCode = clean(body.currency_code).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      return NextResponse.json({ error: "Currency must be a three-letter code." }, { status: 422 });
    }
    patch.currency_code = currencyCode;
  }

  if ("estimated_value" in body) {
    if (body.estimated_value === "" || body.estimated_value === null) {
      patch.estimated_value = null;
    } else {
      const amount = Number(body.estimated_value);
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ error: "Estimated value must be zero or greater." }, { status: 422 });
      }
      patch.estimated_value = amount;
    }
  }

  for (const [key, dateOnly] of [["issue_date", true], ["submission_deadline", false]] as const) {
    if (key in body) {
      const value = clean(body[key]);
      if (!validDate(value, dateOnly)) {
        return NextResponse.json({ error: "Enter valid tender dates." }, { status: 422 });
      }
      patch[key] = value || null;
    }
  }

  if ("department_id" in body) {
    const departmentId = clean(body.department_id);
    if (departmentId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(departmentId)) {
      return NextResponse.json({ error: "Choose a valid department." }, { status: 422 });
    }
    patch.department_id = departmentId || null;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "No tender changes were provided." }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("tenders")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", access.workspaceId)
    .select("*")
    .maybeSingle();

  if (error) {
    const status = error.code === "23505" ? 409 : error.message.toLowerCase().includes("immutable") ? 409 : 400;
    return NextResponse.json({ error: status === 409 ? "The reference is already in use or this submitted tender is locked." : error.message }, { status });
  }
  if (!data) return NextResponse.json({ error: "Tender not found or not available to your role." }, { status: 404 });
  return NextResponse.json({ tender: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.isActive || !access.workspaceId || !access.permissions.has("tender.delete")) {
    return NextResponse.json({ error: "Tender delete permission is required." }, { status: 403 });
  }

  const { data: tender } = await supabase
    .from("tenders")
    .select("id,status")
    .eq("id", id)
    .eq("workspace_id", access.workspaceId)
    .maybeSingle();
  if (!tender) return NextResponse.json({ error: "Tender not found or not available to your role." }, { status: 404 });
  if (tender.status === "SUBMITTED") return NextResponse.json({ error: "Submitted tenders are final and cannot be deleted." }, { status: 409 });

  const { data: attachments, error: attachmentQueryError } = await supabase
    .from("tender_requirements")
    .select("attachment_path")
    .eq("tender_id", id)
    .not("attachment_path", "is", null);
  if (attachmentQueryError) return NextResponse.json({ error: "Tender attachments could not be checked safely. Try again." }, { status: 400 });
  if ((attachments ?? []).some((row) => Boolean(row.attachment_path))) {
    return NextResponse.json({ error: "Remove the attached files from the tender checklist before deleting this tender." }, { status: 409 });
  }

  const { error, count } = await supabase
    .from("tenders")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("workspace_id", access.workspaceId);

  if (error) {
    const submittedLock = error.message.toLowerCase().includes("immutable");
    const blockedByRelatedRecord = error.code === "23503";
    const message = submittedLock
      ? "Submitted tenders are final and cannot be deleted."
      : blockedByRelatedRecord
        ? "This tender still has related records that must be resolved before deletion."
        : "Tender deletion failed. Please try again or contact an administrator.";
    return NextResponse.json(
      { error: message },
      { status: submittedLock || blockedByRelatedRecord ? 409 : 400 },
    );
  }
  if (!count) return NextResponse.json({ error: "Tender not found or not available to your role." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
