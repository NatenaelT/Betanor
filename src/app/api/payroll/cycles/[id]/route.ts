import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.permissions.has("payroll.manage")) return NextResponse.json({ error: "Payroll management permission is required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body?.payslips) ? body.payslips : [];
  if (!rows.length || rows.length > 500) return NextResponse.json({ error: "Provide one or more payslips." }, { status: 422 });
  const seen = new Set<string>();
  const updates: Array<{ id: string; gross_pay: number; deductions: number }> = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") return NextResponse.json({ error: "Each payroll row must be an object." }, { status: 422 });
    const gross = Number(row.grossPay);
    const deductions = Number(row.deductions);
    const slipId = typeof row.id === "string" ? row.id : "";
    if (!slipId || seen.has(slipId) || !Number.isFinite(gross) || !Number.isFinite(deductions) || gross < 0 || deductions < 0 || gross > 999_999_999_999.99 || deductions > gross || Math.abs(gross * 100 - Math.round(gross * 100)) > 0.0001 || Math.abs(deductions * 100 - Math.round(deductions * 100)) > 0.0001) {
      return NextResponse.json({ error: "Payroll rows must have unique slip IDs and valid amounts. Deductions cannot exceed gross pay, and amounts must be limited to two decimal places." }, { status: 422 });
    }
    seen.add(slipId);
    updates.push({ id: slipId, gross_pay: gross, deductions });
  }
  const { data: updatedCount, error } = await supabase.rpc("update_draft_payroll_payslips", { p_cycle_id: id, p_rows: updates });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "PGRST116" ? 404 : error.code === "22023" ? 409 : 400;
    return NextResponse.json({ error: error.message || "Could not save payroll." }, { status });
  }
  return NextResponse.json({ saved: true, updatedCount: Number(updatedCount ?? 0) });
}
