"use client";

export function PrintManualButton() {
  return <button type="button" onClick={() => window.print()} className="print:hidden inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--betanor-field-border)] bg-white px-4 text-sm font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-blue)]">Print or save as PDF</button>;
}
