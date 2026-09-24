/* eslint-disable @next/next/no-html-link-for-pages */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DepartmentPositionManager } from "@/components/admin/department-position-manager";
import { TelegramBotSettings } from "@/components/admin/telegram-bot-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function value(data: FormData, key: string) { return String(data.get(key) ?? "").trim(); }
function upload(data: FormData, key: string) { const file = data.get(key); return file instanceof File && file.size > 0 ? file : null; }
function safeName(name: string) { return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100) || "attachment"; }

async function updateWorkspace(data: FormData) {
  "use server";
  const workspaceId = value(data, "workspaceId"); if (!workspaceId) return;
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("settings.manage") || access.workspaceId !== workspaceId) return;
  await supabase.from("workspaces").update({ name: value(data, "name"), legal_name: value(data, "legalName") || null, timezone: value(data, "timezone") || "Africa/Addis_Ababa", currency_code: value(data, "currencyCode") || "ETB", tin: value(data, "tin") || null, vat_registration_number: value(data, "vat") || null, registered_address: value(data, "address") || null }).eq("id", workspaceId);
  revalidatePath("/workspace"); revalidatePath("/workspace/admin/settings");
}

async function saveLetterSettings(data: FormData) {
  "use server";
  const workspaceId = value(data, "workspaceId"); if (!workspaceId) return;
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("settings.manage") || access.workspaceId !== workspaceId) return;
  const payload: Record<string, string | null> = { workspace_id: workspaceId, reference_prefix: value(data, "referencePrefix") || "BTNR/LET", default_letter_type: value(data, "defaultLetterType") || "General Letter", default_salutation: value(data, "defaultSalutation") || "Dear Sir/Madam,", default_closing: value(data, "defaultClosing") || "Yours faithfully,", default_signatory: value(data, "defaultSignatory") || null, default_signatory_title: value(data, "defaultSignatoryTitle") || null };
  for (const [key, field] of [["stamp", "registration_stamp_path"], ["letterhead", "letterhead_path"], ["footer", "footer_path"]] as const) {
    const file = upload(data, key); if (!file) continue;
    const path = `config/${workspaceId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from("betanor-letters").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "application/octet-stream", upsert: false });
    if (!error) payload[field] = path;
  }
  await supabase.from("workspace_letter_settings").upsert(payload, { onConflict: "workspace_id" });
  revalidatePath("/workspace/admin/settings");
}

async function saveSignatory(data: FormData) {
  "use server";
  const workspaceId = value(data, "workspaceId"); const id = value(data, "id"); const displayName = value(data, "displayName");
  if (!workspaceId || !displayName) return;
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("settings.manage") || access.workspaceId !== workspaceId) return;
  const payload: Record<string, string | boolean | null> = { workspace_id: workspaceId, display_name: displayName, title: value(data, "title") || null, registration_number: value(data, "registrationNumber") || null, profile_id: value(data, "profileId") || null, is_active: data.get("isActive") === "on" };
  for (const [key, field] of [["signature", "signature_path"], ["stamp", "stamp_path"]] as const) {
    const file = upload(data, key); if (!file) continue;
    const path = `config/${workspaceId}/signatories/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from("betanor-letters").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "application/octet-stream", upsert: false });
    if (!error) payload[field] = path;
  }
  if (id) await supabase.from("letter_signatories").update(payload).eq("id", id).eq("workspace_id", workspaceId); else await supabase.from("letter_signatories").insert(payload);
  revalidatePath("/workspace/admin/settings");
}

async function deleteSignatory(data: FormData) {
  "use server";
  const id = value(data, "id"); if (!id) return;
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("settings.manage") || !access.workspaceId) return;
  await supabase.from("letter_signatories").delete().eq("id", id).eq("workspace_id", access.workspaceId);
  revalidatePath("/workspace/admin/settings");
}

async function savePayrollSettings(data: FormData) {
  "use server";
  const workspaceId = value(data, "workspaceId"); if (!workspaceId) return;
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("settings.manage") || access.workspaceId !== workspaceId) return;
  await supabase.from("workspace_payroll_settings").upsert({ workspace_id: workspaceId, pay_frequency: value(data, "payFrequency") || "monthly", payment_day: Number(value(data, "paymentDay") || 30), hours_per_day: Number(value(data, "hoursPerDay") || 8), working_days_per_week: Number(value(data, "workingDays") || 5), pension_employee_rate: Number(value(data, "employeePension") || 0), pension_employer_rate: Number(value(data, "employerPension") || 0), default_email_payslips: data.get("emailPayslips") === "on" }, { onConflict: "workspace_id" });
  revalidatePath("/workspace/admin/settings"); revalidatePath("/workspace/payslips");
}

async function saveFinanceSettings(data: FormData) {
  "use server";
  const workspaceId = value(data, "workspaceId"); if (!workspaceId) return;
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("settings.manage") || access.workspaceId !== workspaceId) return;
  await supabase.from("workspace_finance_settings").upsert({ workspace_id: workspaceId, default_vat_rate: Number(value(data, "vatRate") || 15), default_payment_terms_days: Number(value(data, "termsDays") || 30), fiscal_year_start_month: Number(value(data, "fiscalMonth") || 7), fiscal_year_start_day: Number(value(data, "fiscalDay") || 1), expense_approval_threshold: Number(value(data, "expenseThreshold") || 0), invoice_approval_threshold: Number(value(data, "invoiceThreshold") || 0) }, { onConflict: "workspace_id" });
  revalidatePath("/workspace/admin/settings"); revalidatePath("/workspace/finance"); revalidatePath("/workspace/invoices");
}

export default async function AdminSettingsPage() {
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("settings.manage")) redirect("/workspace");
  const workspace = access.workspace; const workspaceId = access.workspaceId;
  const [{ data: letterSettings }, { data: signatories }, { data: payrollSettings }, { data: financeSettings }, { data: profiles }] = workspaceId ? await Promise.all([
    supabase.from("workspace_letter_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("letter_signatories").select("id,display_name,title,registration_number,profile_id,is_active,signature_path,stamp_path").eq("workspace_id", workspaceId).order("display_name"),
    supabase.from("workspace_payroll_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("workspace_finance_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("profiles").select("id,full_name,job_title").eq("workspace_id", workspaceId).eq("is_active", true).order("full_name"),
  ]) : [{ data: null }, { data: [] }, { data: null }, { data: null }, { data: [] }];
  const letter = letterSettings ?? {}; const payroll = payrollSettings ?? {}; const finance = financeSettings ?? {};
  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">System</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">System configuration</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--betanor-muted)]">One workspace-controlled source for legal identity, correspondence, signatories, payroll policy, finance defaults, and organization structure. Optional fields remain optional.</p></div><div className="flex flex-wrap gap-2"><Badge tone="info">Admin protected</Badge>{access.roleCodes.has("SUPER_ADMIN") ? <a href="/workspace/style-guide" className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-blue)]">Brand style</a> : null}</div></div>
    {workspace ? <Card className="mt-8 p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Legal and regional settings</h2><form action={updateWorkspace} className="mt-5 grid gap-4 md:grid-cols-2"><input type="hidden" name="workspaceId" value={workspace.id}/><div><FieldLabel required htmlFor="workspace-name">Display name</FieldLabel><Input id="workspace-name" name="name" defaultValue={workspace.name} required/></div><div><FieldLabel htmlFor="workspace-legal">Legal name</FieldLabel><Input id="workspace-legal" name="legalName" defaultValue={workspace.legal_name ?? ""}/></div><div><FieldLabel htmlFor="workspace-tin">TIN</FieldLabel><Input id="workspace-tin" name="tin" defaultValue={workspace.tin ?? ""}/></div><div><FieldLabel htmlFor="workspace-vat">VAT registration number</FieldLabel><Input id="workspace-vat" name="vat" defaultValue={workspace.vat_registration_number ?? ""}/></div><div><FieldLabel htmlFor="workspace-currency">Currency</FieldLabel><Input id="workspace-currency" name="currencyCode" defaultValue={workspace.currency_code ?? "ETB"}/></div><div><FieldLabel required htmlFor="workspace-timezone">Timezone</FieldLabel><Input id="workspace-timezone" name="timezone" defaultValue={workspace.timezone ?? "Africa/Addis_Ababa"} required/></div><div className="md:col-span-2"><FieldLabel htmlFor="workspace-address">Registered address</FieldLabel><Input id="workspace-address" name="address" defaultValue={workspace.registered_address ?? ""}/></div><div className="md:col-span-2"><Button type="submit">Save legal settings</Button></div></form></Card> : <Card className="mt-8 p-6">No workspace is assigned to this administrator.</Card>}
    {workspaceId ? <>
      <Card className="mt-8 p-5 sm:p-6"><div><p className="text-xs font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Messaging · notifications</p><h2 className="mt-2 text-lg font-semibold text-[var(--betanor-navy)]">Telegram integration</h2><p className="mt-1 text-sm leading-6 text-[var(--betanor-muted)]">Connect the official Betanor bot for staff and customer alerts and permission-scoped chat. Telegram delivery runs asynchronously and does not delay portal messages.</p></div><TelegramBotSettings/></Card>
      <Card className="mt-8 p-5 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Documents · letters</p><h2 className="mt-2 text-lg font-semibold text-[var(--betanor-navy)]">Letterhead, numbering, and default signatory</h2><p className="mt-1 text-sm leading-6 text-[var(--betanor-muted)]">Upload private letterhead, footer, registration stamp, and set defaults used by new correspondence.</p></div><a className="text-sm font-semibold text-[var(--betanor-blue)]" href="/workspace/letters/templates">Manage templates →</a></div><form action={saveLetterSettings} className="mt-5 grid gap-4 md:grid-cols-2" encType="multipart/form-data"><input type="hidden" name="workspaceId" value={workspaceId}/><div><FieldLabel required htmlFor="letter-prefix">Reference prefix</FieldLabel><Input id="letter-prefix" name="referencePrefix" defaultValue={letter.reference_prefix ?? "BTNR/LET"} required/></div><div><FieldLabel htmlFor="default-letter-type">Default letter type</FieldLabel><Input id="default-letter-type" name="defaultLetterType" defaultValue={letter.default_letter_type ?? "General Letter"}/></div><div><FieldLabel htmlFor="default-salutation">Default salutation</FieldLabel><Input id="default-salutation" name="defaultSalutation" defaultValue={letter.default_salutation ?? "Dear Sir/Madam,"}/></div><div><FieldLabel htmlFor="default-closing">Default closing</FieldLabel><Input id="default-closing" name="defaultClosing" defaultValue={letter.default_closing ?? "Yours faithfully,"}/></div><div><FieldLabel htmlFor="default-signatory">Default signatory</FieldLabel><Input id="default-signatory" name="defaultSignatory" defaultValue={letter.default_signatory ?? ""}/></div><div><FieldLabel htmlFor="default-signatory-title">Default signatory title</FieldLabel><Input id="default-signatory-title" name="defaultSignatoryTitle" defaultValue={letter.default_signatory_title ?? ""}/></div><div><FieldLabel htmlFor="letterhead-upload">Letterhead attachment</FieldLabel><Input id="letterhead-upload" name="letterhead" type="file" accept="image/*,.pdf"/></div><div><FieldLabel htmlFor="footer-upload">Footer attachment</FieldLabel><Input id="footer-upload" name="footer" type="file" accept="image/*,.pdf"/></div><div><FieldLabel htmlFor="stamp-upload">Registration stamp attachment</FieldLabel><Input id="stamp-upload" name="stamp" type="file" accept="image/*,.png,.jpg,.jpeg"/></div><div className="flex items-end"><Button type="submit">Save letter settings</Button></div></form>
      <div className="mt-6 border-t border-[var(--betanor-border)] pt-5"><h3 className="font-semibold text-[var(--betanor-navy)]">Registered signatories</h3><form action={saveSignatory} className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4" encType="multipart/form-data"><input type="hidden" name="workspaceId" value={workspaceId}/><div><FieldLabel required htmlFor="signatory-name">Name</FieldLabel><Input id="signatory-name" name="displayName" required/></div><div><FieldLabel htmlFor="signatory-title">Title</FieldLabel><Input id="signatory-title" name="title" placeholder="Managing Director"/></div><div><FieldLabel htmlFor="signatory-registration">Registration / licence no.</FieldLabel><Input id="signatory-registration" name="registrationNumber"/></div><div><FieldLabel htmlFor="signatory-profile">Linked profile</FieldLabel><select id="signatory-profile" name="profileId" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Not linked</option>{(profiles ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.job_title || profile.id}</option>)}</select></div><div><FieldLabel htmlFor="signature-upload">Signature</FieldLabel><Input id="signature-upload" name="signature" type="file" accept="image/*,.png,.jpg,.jpeg"/></div><div><FieldLabel htmlFor="signatory-stamp-upload">Stamp</FieldLabel><Input id="signatory-stamp-upload" name="stamp" type="file" accept="image/*,.png,.jpg,.jpeg"/></div><label className="flex items-center gap-2 self-end text-sm text-[var(--betanor-text)]"><input defaultChecked name="isActive" type="checkbox"/> Active signatory</label><div className="flex items-end"><Button type="submit">Register signatory</Button></div></form><div className="mt-5 divide-y divide-[var(--betanor-border)]">{(signatories ?? []).map((signatory) => <div className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center" key={signatory.id}><div><p className="text-sm font-semibold text-[var(--betanor-navy)]">{signatory.display_name}</p><p className="text-xs text-[var(--betanor-muted)]">{signatory.title || "Title not set"}{signatory.registration_number ? ` · ${signatory.registration_number}` : ""}</p></div><div className="flex items-center gap-2"><Badge tone={signatory.is_active ? "success" : "neutral"}>{signatory.is_active ? "Active" : "Inactive"}</Badge><form action={deleteSignatory}><input type="hidden" name="id" value={signatory.id}/><Button size="sm" type="submit" variant="ghost">Delete</Button></form></div></div>)}</div></div></Card>
      <div className="mt-8 grid gap-8 xl:grid-cols-2"><Card className="p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Payroll policy</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">Defaults used by payroll generation; statutory rates remain editable for your approved Ethiopian policy.</p><form action={savePayrollSettings} className="mt-5 grid gap-4 sm:grid-cols-2"><input type="hidden" name="workspaceId" value={workspaceId}/><div><FieldLabel required htmlFor="pay-frequency">Pay frequency</FieldLabel><select id="pay-frequency" name="payFrequency" defaultValue={payroll.pay_frequency ?? "monthly"} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm" required><option value="monthly">Monthly</option><option value="biweekly">Biweekly</option><option value="weekly">Weekly</option></select></div><div><FieldLabel required htmlFor="payment-day">Payment day</FieldLabel><Input id="payment-day" name="paymentDay" type="number" min="1" max="31" defaultValue={payroll.payment_day ?? 30} required/></div><div><FieldLabel required htmlFor="hours-day">Hours per day</FieldLabel><Input id="hours-day" name="hoursPerDay" type="number" min="1" max="24" step="0.5" defaultValue={payroll.hours_per_day ?? 8} required/></div><div><FieldLabel required htmlFor="working-days">Working days per week</FieldLabel><Input id="working-days" name="workingDays" type="number" min="1" max="7" defaultValue={payroll.working_days_per_week ?? 5} required/></div><div><FieldLabel htmlFor="employee-pension">Employee pension rate (%)</FieldLabel><Input id="employee-pension" name="employeePension" type="number" min="0" max="100" step="0.01" defaultValue={payroll.pension_employee_rate ?? 0}/></div><div><FieldLabel htmlFor="employer-pension">Employer pension rate (%)</FieldLabel><Input id="employer-pension" name="employerPension" type="number" min="0" max="100" step="0.01" defaultValue={payroll.pension_employer_rate ?? 0}/></div><label className="flex items-center gap-2 text-sm text-[var(--betanor-text)] sm:col-span-2"><input defaultChecked={payroll.default_email_payslips !== false} name="emailPayslips" type="checkbox"/> Queue registered employee email notifications when a cycle is published</label><div className="sm:col-span-2"><Button type="submit">Save payroll policy</Button></div></form></Card>
      <Card className="p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Finance policy</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">Ethiopian VAT, payment terms, fiscal year, and approval thresholds used across finance screens.</p><form action={saveFinanceSettings} className="mt-5 grid gap-4 sm:grid-cols-2"><input type="hidden" name="workspaceId" value={workspaceId}/><div><FieldLabel required htmlFor="default-vat">Default VAT rate (%)</FieldLabel><Input id="default-vat" name="vatRate" type="number" min="0" max="100" step="0.01" defaultValue={finance.default_vat_rate ?? 15} required/></div><div><FieldLabel required htmlFor="terms-days">Default payment terms (days)</FieldLabel><Input id="terms-days" name="termsDays" type="number" min="0" max="365" defaultValue={finance.default_payment_terms_days ?? 30} required/></div><div><FieldLabel required htmlFor="fiscal-month">Fiscal year start month</FieldLabel><Input id="fiscal-month" name="fiscalMonth" type="number" min="1" max="12" defaultValue={finance.fiscal_year_start_month ?? 7} required/></div><div><FieldLabel required htmlFor="fiscal-day">Fiscal year start day</FieldLabel><Input id="fiscal-day" name="fiscalDay" type="number" min="1" max="31" defaultValue={finance.fiscal_year_start_day ?? 1} required/></div><div><FieldLabel htmlFor="expense-threshold">Expense approval threshold (ETB)</FieldLabel><Input id="expense-threshold" name="expenseThreshold" type="number" min="0" step="0.01" defaultValue={finance.expense_approval_threshold ?? 0}/></div><div><FieldLabel htmlFor="invoice-threshold">Invoice approval threshold (ETB)</FieldLabel><Input id="invoice-threshold" name="invoiceThreshold" type="number" min="0" step="0.01" defaultValue={finance.invoice_approval_threshold ?? 0}/></div><div className="sm:col-span-2"><Button type="submit">Save finance policy</Button></div></form></Card></div>
      <DepartmentPositionManager />
    </> : null}
    <Card className="mt-8 border-blue-100 bg-blue-50/50 p-5"><p className="text-sm font-semibold text-[var(--betanor-navy)]">Configuration principles</p><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">ETB and Africa/Addis_Ababa are safe defaults. Private attachments are stored in the Betanor letters bucket. Submitted letters and published payroll are controlled records and cannot be changed through normal workspace actions.</p></Card>
  </main>;
}
