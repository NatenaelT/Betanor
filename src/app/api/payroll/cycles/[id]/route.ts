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
  const { data: cycle } = await supabase.from("payroll_cycles").select("id,status,published_at").eq("id", id).eq("workspace_id", access.workspaceId).maybeSingle();
  if (!cycle) return NextResponse.json({ error: "Payroll cycle not found." }, { status: 404 });
  if (cycle.published_at || !["draft", "submitted"].includes(cycle.status)) return NextResponse.json({ error: "Only draft or submitted payroll can be edited." }, { status: 409 });
  for (const row of rows) {
    const gross = Number(row.grossPay);
    const deductions = Number(row.deductions);
    if (!row.id || !Number.isFinite(gross) || !Number.isFinite(deductions) || gross < 0 || deductions < 0 || deductions > gross) return NextResponse.json({ error: "Payroll values must be valid and deductions cannot exceed gross pay." }, { status: 422 });
    const { error } = await supabase.from("payslips").update({ gross_pay: gross, deductions, net_pay: gross - deductions }).eq("id", row.id).eq("payroll_cycle_id", id).eq("status", "draft");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ saved: true });
}
