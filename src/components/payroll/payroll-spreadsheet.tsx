"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EmployeeRelation = { first_name?: string; last_name?: string; employee_number?: string } | { first_name?: string; last_name?: string; employee_number?: string }[];
type Slip = { id: string; employee_id: string; gross_pay: number; deductions: number; net_pay: number; currency_code: string; employees?: EmployeeRelation | null };

function employeeFor(slip: Slip) {
  return Array.isArray(slip.employees) ? slip.employees[0] : slip.employees;
}

function spreadsheetRows(slips: Slip[]) {
  return slips.map((slip) => ({ ...slip, gross_pay: Number(slip.gross_pay ?? 0), deductions: Number(slip.deductions ?? 0), net_pay: Number(slip.gross_pay ?? 0) - Number(slip.deductions ?? 0) }));
}

export function PayrollSpreadsheet({ cycleId, editable, slips }: { cycleId: string; editable: boolean; slips: Slip[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState(() => spreadsheetRows(slips));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  function setValue(id: string, field: "gross_pay" | "deductions", rawValue: string) {
    const parsed = rawValue === "" ? 0 : Number(rawValue);
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: Number.isFinite(parsed) ? parsed : 0, net_pay: field === "gross_pay" ? parsed - row.deductions : row.gross_pay - parsed } : row));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/payroll/cycles/${cycleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payslips: rows.map((row) => ({ id: row.id, grossPay: row.gross_pay, deductions: row.deductions })) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload.error || "Could not save payroll.");
        return;
      }
      setMessage(`Saved ${payload.updatedCount ?? rows.length} payroll rows.`);
      router.refresh();
    } catch {
      setMessage("Could not reach the payroll service. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function importWorkbook(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/payroll/cycles/${cycleId}/import`, { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload.error || "Could not import this workbook.");
        return;
      }
      const updatedRows = new Map<string, { gross_pay: number; deductions: number; net_pay: number }>((payload.updatedRows ?? []).map((row: { id: string; gross_pay: number; deductions: number; net_pay: number }) => [row.id, row]));
      setRows((current) => current.map((row) => ({ ...row, ...(updatedRows.get(row.id) ?? {}) })));
      setMessage(`Imported ${payload.importedCount ?? 0} rows from ${payload.fileName || file.name}.`);
      router.refresh();
    } catch {
      setMessage("Could not reach the payroll service. Try again.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return <section aria-label="Payroll spreadsheet" className="mt-4">
    {editable ? <div className="mb-3 flex flex-col justify-between gap-3 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center"><div className="max-w-2xl"><p className="text-sm font-semibold text-[var(--betanor-navy)]">Edit this draft in the portal or in Excel</p><p className="mt-1 text-xs leading-5 text-[var(--betanor-muted)]">Download the workbook, update Gross Pay and Deductions, keep Employee ID unchanged, then upload it here. Net Pay is recalculated. Formula cells are not imported.</p></div><div className="flex flex-wrap gap-2"><a className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--betanor-field-border)] bg-white px-3 text-xs font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-blue)]" href={`/api/payroll/cycles/${cycleId}/export/xlsx`}>Download Excel workbook</a><input ref={fileRef} id={`payroll-import-${cycleId}`} type="file" accept=".xlsx,.xls,.csv" onChange={importWorkbook} className="sr-only" /><Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={importing || saving}>{importing ? "Importing…" : "Upload Excel file"}</Button></div></div> : null}
    <div className="overflow-x-auto rounded-lg border border-[var(--betanor-border)]" tabIndex={0} aria-label="Payroll rows. Scroll horizontally to view all columns."><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-slate-50 text-[var(--betanor-muted)]"><tr><th scope="col" className="px-3 py-2">Employee</th><th scope="col" className="px-3 py-2">Employee ID</th><th scope="col" className="px-3 py-2">Gross pay</th><th scope="col" className="px-3 py-2">Deductions</th><th scope="col" className="px-3 py-2">Net pay</th><th scope="col" className="px-3 py-2">Currency</th></tr></thead><tbody className="divide-y divide-[var(--betanor-border)]">{rows.map((row) => { const employee = employeeFor(row); const invalid = row.gross_pay < 0 || row.deductions < 0 || row.deductions > row.gross_pay; return <tr key={row.id}><td className="whitespace-nowrap px-3 py-2 font-semibold text-[var(--betanor-navy)]">{employee?.first_name} {employee?.last_name}</td><td className="whitespace-nowrap px-3 py-2">{employee?.employee_number || row.employee_id}</td><td className="px-3 py-2">{editable ? <Input aria-label={`Gross pay for ${employee?.first_name ?? "employee"}`} className="h-9 min-h-9 w-28 text-xs" type="number" min="0" max="999999999999.99" step="0.01" value={row.gross_pay} onChange={(event) => setValue(row.id, "gross_pay", event.target.value)} /> : row.gross_pay.toFixed(2)}</td><td className="px-3 py-2">{editable ? <Input aria-label={`Deductions for ${employee?.first_name ?? "employee"}`} className="h-9 min-h-9 w-28 text-xs" type="number" min="0" max={row.gross_pay} step="0.01" value={row.deductions} onChange={(event) => setValue(row.id, "deductions", event.target.value)} /> : row.deductions.toFixed(2)}</td><td className={`whitespace-nowrap px-3 py-2 font-semibold ${invalid ? "text-red-700" : "text-[var(--betanor-navy)]"}`}>{invalid ? "Check amounts" : row.net_pay.toFixed(2)}</td><td className="whitespace-nowrap px-3 py-2">{row.currency_code}</td></tr>; })}</tbody></table></div>
    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">{editable ? <Button size="sm" onClick={save} disabled={saving || importing || rows.some((row) => row.gross_pay < 0 || row.deductions < 0 || row.deductions > row.gross_pay)}>{saving ? "Saving…" : "Save payroll"}</Button> : null}<div className="flex flex-wrap gap-2"><a className="rounded-lg border border-[var(--betanor-field-border)] px-3 py-2 text-xs font-semibold text-[var(--betanor-navy)] hover:bg-slate-50" href={`/api/payroll/cycles/${cycleId}/export/xlsx`}>Excel</a><a className="rounded-lg border border-[var(--betanor-field-border)] px-3 py-2 text-xs font-semibold text-[var(--betanor-navy)] hover:bg-slate-50" href={`/api/payroll/cycles/${cycleId}/export/doc`}>Word</a><a className="rounded-lg border border-[var(--betanor-field-border)] px-3 py-2 text-xs font-semibold text-[var(--betanor-navy)] hover:bg-slate-50" href={`/api/payroll/cycles/${cycleId}/export/pdf`}>PDF</a></div>{message ? <span role="status" className="min-w-0 break-words text-xs text-[var(--betanor-muted)]">{message}</span> : null}</div>
  </section>;
}
