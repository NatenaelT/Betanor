import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function xml(value: unknown) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
type PayrollSlipRow = { employees?: { first_name?: string | null; last_name?: string | null; employee_number?: string | null }[]; gross_pay?: number | string | null; deductions?: number | string | null; net_pay?: number | string | null; currency_code?: string | null };
function rowsHtml(rows: Array<Record<string, unknown>>) { return rows.map((row) => `<tr><td>${xml(row.name)}</td><td>${xml(row.employeeNumber)}</td><td>${xml(row.gross)}</td><td>${xml(row.deductions)}</td><td>${xml(row.net)}</td><td>${xml(row.currency)}</td></tr>`).join(""); }
function pdfText(value: string) { return value.replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function payrollPdf(title: string, rows: Array<Record<string, unknown>>) {
  const objects: string[] = []; const add = (content: string) => { objects.push(content); return objects.length; }; const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const lines = [title, "Employee | ID | Gross | Deductions | Net", ...rows.map((row) => `${row.name} | ${row.employeeNumber} | ${row.gross} | ${row.deductions} | ${row.net}`)];
  let y = 780; let stream = "BT\n"; for (const line of lines) { stream += `/${"F1"} 9 Tf 48 ${y} Td (${pdfText(line)}) Tj\n0 ${-14} Td\n`; y -= 14; if (y < 50) break; } stream += "ET";
  const streamObject = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`); const page = add(`<< /Type /Page /Parent PAGES /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${streamObject} 0 R >>`); const pages = add(`<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`); const catalog = add(`<< /Type /Catalog /Pages ${pages} 0 R >>`);
  let output = "%PDF-1.4\n"; const offsets = [0]; objects.forEach((object, index) => { const body = object.replace(/PAGES/g, `${pages} 0 R`); offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${body}\nendobj\n`; }); const xref = Buffer.byteLength(output); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; for (let i = 1; i < offsets.length; i += 1) output += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`; output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`; return Buffer.from(output, "binary");
}

function payrollWorkbook(rows: Array<Record<string, unknown>>) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Employee ID", "Employee Name", "Gross Pay", "Deductions", "Net Pay", "Currency"],
    ...rows.map((row) => [row.employeeNumber, row.name, Number(row.gross), Number(row.deductions), Number(row.net), row.currency]),
  ]);
  sheet["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];
  for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
    for (let columnIndex = 2; columnIndex <= 4; columnIndex += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] as XLSX.CellObject | undefined;
      if (cell) cell.z = "#,##0.00";
    }
  }
  sheet["!autofilter"] = { ref: `A1:F${Math.max(1, rows.length + 1)}` };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Payroll");
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer", compression: true });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; format: string }> }) {
  const { id, format } = await params; const normalized = format.toLowerCase();
  if (!["xls", "xlsx", "doc", "docx", "pdf"].includes(normalized)) return NextResponse.json({ error: "Unsupported export format." }, { status: 400 });
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || (!access.permissions.has("payroll.manage") && !access.permissions.has("payroll.read_self"))) return NextResponse.json({ error: "Payroll access is required." }, { status: 403 });
  const { data: cycle } = await supabase.from("payroll_cycles").select("id,period_start,period_end,status,published_at,payslips(id,employee_id,gross_pay,deductions,net_pay,currency_code,employees(first_name,last_name,employee_number))").eq("id", id).eq("workspace_id", access.workspaceId).maybeSingle();
  if (!cycle) return NextResponse.json({ error: "Payroll cycle not found." }, { status: 404 });
  const rows = (cycle.payslips as PayrollSlipRow[] ?? []).map((slip) => ({ name: `${slip.employees?.[0]?.first_name ?? "Employee"} ${slip.employees?.[0]?.last_name ?? ""}`.trim(), employeeNumber: slip.employees?.[0]?.employee_number ?? "", gross: Number(slip.gross_pay ?? 0).toFixed(2), deductions: Number(slip.deductions ?? 0).toFixed(2), net: Number(slip.net_pay ?? 0).toFixed(2), currency: slip.currency_code ?? "ETB" }));
  const title = `Betanor payroll ${cycle.period_start} to ${cycle.period_end}`; const table = `<h1>${xml(title)}</h1><table border="1"><thead><tr><th>Employee</th><th>Employee ID</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Currency</th></tr></thead><tbody>${rowsHtml(rows)}</tbody></table>`;
  if (normalized === "xlsx") return new NextResponse(payrollWorkbook(rows) as unknown as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="payroll-${cycle.period_start}.xlsx"`, "Cache-Control": "private, no-store" } });
  if (normalized === "pdf") return new NextResponse(payrollPdf(title, rows) as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="payroll-${cycle.period_start}.pdf"` } });
  if (normalized === "doc" || normalized === "docx") return new NextResponse(`<!doctype html><html><body style="font-family:Arial">${table}</body></html>`, { headers: { "Content-Type": "application/msword", "Content-Disposition": `attachment; filename="payroll-${cycle.period_start}.doc"` } });
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"></head><body>${table}</body></html>`, { headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": `attachment; filename="payroll-${cycle.period_start}.xls"` } });
}
