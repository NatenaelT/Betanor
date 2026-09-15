import Link from "next/link";
import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { financeTone, formatEtb, titleCase } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

async function createInvoice(data: FormData) {
  "use server";
  const workspaceId = String(data.get("workspaceId") ?? "");
  const title = String(data.get("description") ?? "").trim();
  const amount = Number(data.get("amount") ?? 0);
  const vatRate = Number(data.get("vatRate") ?? 0);
  const taxInclusive = data.get("taxInclusive") === "on";
  if (!workspaceId || !title || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) return;
  const taxAmount = taxInclusive ? amount - amount / (1 + vatRate / 100) : amount * vatRate / 100;
  const subtotal = taxInclusive ? amount - taxAmount : amount;
  const total = taxInclusive ? amount : amount + taxAmount;
  const supabase = await createClient();
  const invoiceNumber = `BTNR-INV-${new Date().getFullYear()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
  const { data: invoice, error } = await supabase.from("invoices").insert({
    workspace_id: workspaceId,
    invoice_number: invoiceNumber,
    customer_id: String(data.get("customerId") ?? "") || null,
    project_id: String(data.get("projectId") ?? "") || null,
    issued_on: String(data.get("issuedOn") ?? "") || new Date().toISOString().slice(0, 10),
    due_on: String(data.get("dueOn") ?? "") || null,
    currency_code: "ETB",
    subtotal,
    vat_rate: vatRate,
    tax_amount: taxAmount,
    tax_inclusive: taxInclusive,
    total_amount: total,
    supplier_tin: String(data.get("supplierTin") ?? "").trim() || null,
    supplier_vat_registration_number: String(data.get("supplierVat") ?? "").trim() || null,
    customer_tin: String(data.get("customerTin") ?? "").trim() || null,
    customer_vat_registration_number: String(data.get("customerVat") ?? "").trim() || null,
    payment_terms: String(data.get("paymentTerms") ?? "").trim() || null,
    place_of_supply: String(data.get("placeOfSupply") ?? "").trim() || "Addis Ababa, Ethiopia",
    status: "draft",
  }).select("id").single();
  if (invoice && !error) {
    await supabase.from("invoice_lines").insert({ invoice_id: invoice.id, line_number: 1, description: title, quantity: 1, unit_price: subtotal, line_total: subtotal });
    revalidatePath("/workspace/invoices");
    revalidatePath("/workspace/finance");
  }
}

async function submitInvoice(invoiceId: string) {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", invoiceId).eq("status", "draft");
  if (!error) { revalidatePath("/workspace/invoices"); revalidatePath("/workspace/finance"); }
}

async function approveInvoice(invoiceId: string) {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", invoiceId).in("status", ["submitted", "in_review"]);
  if (!error) { revalidatePath("/workspace/invoices"); revalidatePath("/workspace/finance"); }
}

async function recordPayment(invoiceId: string, data: FormData) {
  "use server";
  const amount = Number(data.get("amount") ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({ invoice_id: invoiceId, received_on: String(data.get("receivedOn") ?? "") || new Date().toISOString().slice(0, 10), amount, currency_code: "ETB", method: String(data.get("method") ?? "").trim() || null, reference: String(data.get("reference") ?? "").trim() || null });
  if (!error) { revalidatePath("/workspace/invoices"); revalidatePath("/workspace/finance"); }
}

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { workspaceId, workspace } = await resolveWorkspace(supabase);
  const [customersResult, projectsResult, invoicesResult] = workspaceId
    ? await Promise.all([
      supabase.from("customers").select("id,name,tin,vat_registration_number").eq("workspace_id", workspaceId).order("name"),
      supabase.from("projects").select("id,name,project_code").eq("workspace_id", workspaceId).order("name"),
      supabase.from("invoices").select("id,invoice_number,issued_on,due_on,subtotal,vat_rate,tax_amount,tax_inclusive,total_amount,currency_code,status,payment_terms,place_of_supply,customer_tin,customer_vat_registration_number,customers(name,tin,vat_registration_number),projects(name,project_code),payments(amount,received_on,method,reference)").eq("workspace_id", workspaceId).order("issued_on", { ascending: false }).limit(80),
    ])
    : [{ data: [] }, { data: [] }, { data: [], error: null }];
  const invoices = invoicesResult.data ?? [];
  const invoiced = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount ?? 0), 0);
  const received = invoices.reduce((sum, invoice) => sum + (invoice.payments ?? []).reduce((paymentSum, payment) => paymentSum + Number(payment.amount ?? 0), 0), 0);

  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Finance · receivables</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Issue, evidence, collect.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Create a controlled ETB invoice linked to the customer and delivery project, preserve VAT/TIN evidence, then record bank or cash receipts against the outstanding balance.</p></div><Link href="/workspace/finance" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">← Finance overview</Link></div>{!workspaceId ? <Card className="mt-8 p-6">Finance access is required.</Card> : <>
    <div className="mt-8 grid gap-4 sm:grid-cols-3"><Card className="p-5"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">Invoiced</p><p className="mt-2 text-2xl font-semibold text-[var(--betanor-navy)]">{formatEtb(invoiced)}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">{invoices.length} invoice{invoices.length === 1 ? "" : "s"}</p></Card><Card className="p-5"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">Collected</p><p className="mt-2 text-2xl font-semibold text-[var(--betanor-navy)]">{formatEtb(received)}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Recorded receipts</p></Card><Card className="p-5"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">Outstanding</p><p className="mt-2 text-2xl font-semibold text-[var(--betanor-navy)]">{formatEtb(Math.max(invoiced - received, 0))}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">Management receivables view</p></Card></div>
    <Card className="mt-8 p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Create invoice draft</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">The default VAT suggestion is 15%; confirm the applicable Ethiopian tax treatment with your tax adviser before issue. This record is not a substitute for an approved fiscal device or statutory tax invoice.</p><form action={createInvoice} className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4"><input type="hidden" name="workspaceId" value={workspaceId}/><div className="lg:col-span-2"><FieldLabel htmlFor="invoice-description">Service / deliverable</FieldLabel><Input id="invoice-description" name="description" required/></div><div><FieldLabel htmlFor="invoice-customer">Customer</FieldLabel><select id="invoice-customer" name="customerId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Customer to be assigned</option>{customersResult.data?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div><div><FieldLabel htmlFor="invoice-project">Project</FieldLabel><select id="invoice-project" name="projectId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">No project linked</option>{projectsResult.data?.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.project_code}</option>)}</select></div><div><FieldLabel htmlFor="invoice-amount">Amount before VAT (ETB)</FieldLabel><Input id="invoice-amount" min="0.01" name="amount" required step="0.01" type="number"/></div><div><FieldLabel htmlFor="invoice-vat">VAT rate (%)</FieldLabel><Input id="invoice-vat" defaultValue="15" min="0" max="100" name="vatRate" required step="0.01" type="number"/></div><div className="flex items-end pb-2"><label className="flex items-center gap-2 text-sm text-[var(--betanor-text)]"><input name="taxInclusive" type="checkbox"/> Amount includes VAT</label></div><div><FieldLabel htmlFor="invoice-issued">Issue date</FieldLabel><Input id="invoice-issued" name="issuedOn" required type="date"/></div><div><FieldLabel htmlFor="invoice-due">Due date</FieldLabel><Input id="invoice-due" name="dueOn" type="date"/></div><div><FieldLabel htmlFor="invoice-payment-terms">Payment terms</FieldLabel><Input id="invoice-payment-terms" name="paymentTerms"/></div><div><FieldLabel htmlFor="invoice-place">Place of supply</FieldLabel><Input id="invoice-place" defaultValue="Addis Ababa, Ethiopia" name="placeOfSupply"/></div><div><FieldLabel htmlFor="invoice-supplier-tin">Betanor TIN</FieldLabel><Input id="invoice-supplier-tin" defaultValue={workspace?.tin ?? ""} name="supplierTin"/></div><div><FieldLabel htmlFor="invoice-supplier-vat">Betanor VAT registration</FieldLabel><Input id="invoice-supplier-vat" defaultValue={workspace?.vat_registration_number ?? ""} name="supplierVat"/></div><div><FieldLabel htmlFor="invoice-customer-tin">Customer TIN</FieldLabel><Input id="invoice-customer-tin" name="customerTin"/></div><div><FieldLabel htmlFor="invoice-customer-vat">Customer VAT registration</FieldLabel><Input id="invoice-customer-vat" name="customerVat"/></div><div className="lg:col-span-4"><Button type="submit">Save invoice draft</Button></div></form></Card>
    <Card className="mt-8 overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--betanor-border)] px-5 py-4"><div><h2 className="font-semibold text-[var(--betanor-navy)]">Invoice ledger</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">Receipts are matched to each invoice and outstanding balance.</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold tracking-wide text-[var(--betanor-blue)]">ETB</span></div>{invoices.length ? <div className="divide-y divide-[var(--betanor-border)]">{invoices.map((invoice) => { const paid = (invoice.payments ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0); const balance = Math.max(Number(invoice.total_amount ?? 0) - paid, 0); return <div key={invoice.id} className="px-5 py-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[var(--betanor-navy)]">{invoice.invoice_number}</p><Badge tone={financeTone(invoice.status)}>{titleCase(invoice.status)}</Badge></div><p className="mt-1 text-xs text-[var(--betanor-muted)]">{invoice.customers?.[0]?.name || "Customer pending"}{invoice.projects?.[0]?.name ? ` · ${invoice.projects[0].name}` : ""} · Issued {invoice.issued_on}{invoice.due_on ? ` · Due ${invoice.due_on}` : ""}</p><p className="mt-2 text-xs text-[var(--betanor-muted)]">Subtotal {formatEtb(invoice.subtotal)} · VAT {invoice.vat_rate}% ({formatEtb(invoice.tax_amount)}) · {invoice.tax_inclusive ? "VAT inclusive" : "VAT exclusive"}</p></div><div className="flex items-center gap-5"><div className="text-right"><p className="text-lg font-semibold text-[var(--betanor-navy)]">{formatEtb(invoice.total_amount)}</p><p className="text-[10px] text-[var(--betanor-muted)]">{formatEtb(balance)} outstanding</p></div>{invoice.status === "draft" ? <form action={submitInvoice.bind(null, invoice.id)}><Button size="sm" type="submit">Submit</Button></form> : null}{invoice.status === "submitted" || invoice.status === "in_review" ? <form action={approveInvoice.bind(null, invoice.id)}><Button size="sm" type="submit">Approve</Button></form> : null}</div></div><div className="mt-4 rounded-lg bg-slate-50 p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold tracking-wide text-[var(--betanor-muted)] uppercase">Record receipt</p><p className="text-xs text-[var(--betanor-muted)]">{invoice.payments?.length ?? 0} receipt{invoice.payments?.length === 1 ? "" : "s"}</p></div><form action={recordPayment.bind(null, invoice.id)} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Input aria-label="Receipt amount" min="0.01" name="amount" placeholder="Amount (ETB)" step="0.01" type="number"/><Input aria-label="Receipt date" name="receivedOn" type="date"/><Input aria-label="Payment method" name="method" placeholder="Method (bank / cash)"/><Input aria-label="Payment reference" name="reference" placeholder="Bank reference"/><Button size="sm" type="submit">Record receipt</Button></form></div></div>; })}</div> : <p className="px-5 py-10 text-sm text-[var(--betanor-muted)]">No invoices have been created.</p>}</Card>
  </>}</main>;
}

