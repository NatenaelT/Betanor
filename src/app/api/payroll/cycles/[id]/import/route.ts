import * as XLSX from "xlsx";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayrollSlip = {
  id: string;
  employee_id: string;
  gross_pay: number | string;
  deductions: number | string;
  currency_code: string;
  status: string;
  employees: { employee_number?: string | null } | { employee_number?: string | null }[] | null;
};

type ImportRow = { id: string; gross_pay: number; deductions: number };

function normalizedHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cellHasFormula(sheet: XLSX.WorkSheet, row: number, column: number) {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  const cell = sheet[address] as XLSX.CellObject | undefined;
  return Boolean(cell?.f);
}

function amount(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll(",", "");
  if (!normalized || !/^(?:\d+|\d*\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function relationEmployeeNumber(slip: PayrollSlip) {
  const relation = Array.isArray(slip.employees) ? slip.employees[0] : slip.employees;
  return String(relation?.employee_number ?? "").trim();
}

function parseWorkbook(fileName: string, bytes: Buffer, slips: PayrollSlip[]) {
  const workbook = XLSX.read(bytes, { type: "buffer", cellFormula: true, cellDates: false, dense: false, sheetRows: 550 });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("The workbook does not contain a worksheet.");
  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
  const headerIndex = matrix.slice(0, 30).findIndex((row) => {
    const headers = row.map(normalizedHeader);
    return headers.some((header) => ["employeeid", "employeenumber", "employeeidentifier"].includes(header))
      && headers.some((header) => ["gross", "grosspay", "grosssalary"].includes(header))
      && headers.some((header) => ["deductions", "totaldeductions"].includes(header));
  });
  if (headerIndex < 0) throw new Error("Use the Betanor payroll workbook. Required columns are Employee ID, Gross Pay, and Deductions.");

  const headers = matrix[headerIndex].map(normalizedHeader);
  const identifierIndex = headers.findIndex((header) => ["employeeid", "employeenumber", "employeeidentifier"].includes(header));
  const grossIndex = headers.findIndex((header) => ["gross", "grosspay", "grosssalary"].includes(header));
  const deductionsIndex = headers.findIndex((header) => ["deductions", "totaldeductions"].includes(header));
  const slipsByIdentifier = new Map<string, PayrollSlip>();
  for (const slip of slips) {
    slipsByIdentifier.set(slip.employee_id.toLowerCase(), slip);
    const employeeNumber = relationEmployeeNumber(slip);
    if (employeeNumber) slipsByIdentifier.set(employeeNumber.toLowerCase(), slip);
  }

  const updates: ImportRow[] = [];
  const seen = new Set<string>();
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    if (!row.some((value) => String(value ?? "").trim() !== "")) continue;
    const employeeIdentifier = String(row[identifierIndex] ?? "").trim();
    const gross = amount(row[grossIndex]);
    const deductions = amount(row[deductionsIndex]);
    if (cellHasFormula(sheet, index, identifierIndex) || cellHasFormula(sheet, index, grossIndex) || cellHasFormula(sheet, index, deductionsIndex)) {
      throw new Error(`Row ${index + 1} contains a formula. Enter final numeric values before uploading.`);
    }
    const slip = slipsByIdentifier.get(employeeIdentifier.toLowerCase());
    if (!employeeIdentifier || !slip) throw new Error(`Row ${index + 1} has an Employee ID that is not in this payroll cycle.`);
    if (seen.has(slip.id)) throw new Error(`Employee ${employeeIdentifier} appears more than once in the workbook.`);
    if (gross === null || deductions === null || gross < 0 || deductions < 0 || gross > 999_999_999_999.99 || deductions > gross) {
      throw new Error(`Row ${index + 1} has invalid amounts. Deductions must be between zero and Gross Pay.`);
    }
    if (Math.abs(gross * 100 - Math.round(gross * 100)) > 0.0001 || Math.abs(deductions * 100 - Math.round(deductions * 100)) > 0.0001) {
      throw new Error(`Row ${index + 1} has more than two decimal places.`);
    }
    if (slip.status !== "draft") throw new Error(`Employee ${employeeIdentifier} does not have an editable draft payslip.`);
    seen.add(slip.id);
    updates.push({ id: slip.id, gross_pay: gross, deductions });
  }
  if (updates.length === 0) throw new Error("The workbook has no payroll rows to import.");
  if (updates.length > 500) throw new Error("A payroll upload can include at most 500 rows.");
  return { updates, fileName };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.permissions.has("payroll.manage")) {
    return Response.json({ error: "Payroll management permission is required." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose an Excel workbook to upload." }, { status: 422 });
  if (file.size === 0 || file.size > 5 * 1024 * 1024) return Response.json({ error: "The workbook must be smaller than 5 MB." }, { status: 413 });
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return Response.json({ error: "Upload an .xlsx, .xls, or .csv payroll file." }, { status: 415 });

  const { data: cycle, error: cycleError } = await supabase
    .from("payroll_cycles")
    .select("id,status,published_at,payslips(id,employee_id,gross_pay,deductions,currency_code,status,employees(employee_number))")
    .eq("id", id)
    .eq("workspace_id", access.workspaceId)
    .maybeSingle();
  if (cycleError || !cycle) return Response.json({ error: "Payroll cycle not found." }, { status: 404 });
  if (cycle.status !== "draft" || cycle.published_at) return Response.json({ error: "Only an unpublished draft payroll cycle can be edited." }, { status: 409 });

  let parsed: ReturnType<typeof parseWorkbook>;
  try {
    parsed = parseWorkbook(file.name, Buffer.from(await file.arrayBuffer()), (cycle.payslips ?? []) as unknown as PayrollSlip[]);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "This file could not be read as a payroll workbook." }, { status: 422 });
  }

  const { data: updatedCount, error } = await supabase.rpc("update_draft_payroll_payslips", { p_cycle_id: id, p_rows: parsed.updates });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "22023" ? 409 : 400;
    return Response.json({ error: error.message || "Could not import payroll." }, { status });
  }
  return Response.json({
    importedCount: Number(updatedCount ?? 0),
    fileName: parsed.fileName,
    updatedRows: parsed.updates.map((row) => ({ ...row, net_pay: row.gross_pay - row.deductions })),
  });
}
