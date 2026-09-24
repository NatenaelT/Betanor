import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { FaqList } from "@/components/help/faq-list";
import { PrintManualButton } from "@/components/help/print-manual-button";
import { workspaceFaqs, workspaceHelpSections } from "@/lib/help-content";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const metadata = { title: "Help & user manual" };

export default async function WorkspaceHelpPage() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.isActive || !access.hasStaffRole) redirect("/login?next=/workspace/help");
  const has = (permission?: string | string[]) => !permission || (Array.isArray(permission) ? permission.some((code) => access.permissions.has(code)) : access.permissions.has(permission)) || access.roleCodes.has("SUPER_ADMIN");
  const sections = workspaceHelpSections.filter((section) => has(section.permission));
  const faqs = workspaceFaqs.filter((item) => has(item.permission));
  const roles = [...access.roleCodes].join(", ") || "Staff user";

  return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Help & support</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Your role-based user manual</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Guidance is tailored to the modules assigned to your account. Your current role{access.roleCodes.size === 1 ? " is" : "s are"} {roles}.</p></div><div className="flex flex-col gap-2 sm:flex-row"><PrintManualButton /><Link href="/contact" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--betanor-border)] bg-white px-4 text-sm font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-blue)]">Contact Betanor support</Link></div></div>
    <section aria-labelledby="manual-title" className="mt-8"><h2 id="manual-title" className="mb-4 text-xl font-semibold text-[var(--betanor-navy)]">Your user manual</h2><div className="grid gap-4 md:grid-cols-2">{sections.map((section) => <Card key={section.title} className="p-5 sm:p-6"><h3 className="text-lg font-semibold text-[var(--betanor-navy)]">{section.title}</h3><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">{section.summary}</p><ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--betanor-text)]">{section.steps.map((step) => <li key={step}>{step}</li>)}</ol></Card>)}</div></section>
    <FaqList items={faqs} title="Staff FAQs" />
    <Card className="mt-6 border-blue-100 bg-blue-50/50 p-5 sm:p-6"><h2 className="font-semibold text-[var(--betanor-navy)]">Need a hand?</h2><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">For workspace access or missing permissions, contact your system administrator. For customer or service requests, use the customer conversation or Contact page.</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/workspace" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Return to workspace →</Link><Link href="/contact" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Contact support →</Link></div></Card>
  </main>;
}
