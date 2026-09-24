import Link from "next/link";

import { Card } from "@/components/ui/card";
import { FaqList } from "@/components/help/faq-list";
import { PrintManualButton } from "@/components/help/print-manual-button";
import { customerFaqs, customerHelpSections } from "@/lib/help-content";

export const metadata = { title: "Customer help and support" };

export default function CustomerHelpPage() {
  return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Customer portal help</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">How can we help?</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Your manual and answers for account access, quotation requests, support, messages, and customer records.</p></div><PrintManualButton /></div>
    <section aria-labelledby="manual-title" className="mt-8"><h2 id="manual-title" className="mb-4 text-xl font-semibold text-[var(--betanor-navy)]">Customer user manual</h2><div className="grid gap-4 md:grid-cols-2">{customerHelpSections.map((section) => <Card key={section.title} className="p-5 sm:p-6"><h3 className="text-lg font-semibold text-[var(--betanor-navy)]">{section.title}</h3><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">{section.summary}</p><ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--betanor-text)]">{section.steps.map((step) => <li key={step}>{step}</li>)}</ol></Card>)}</div></section>
    <FaqList items={customerFaqs} title="Customer FAQs" />
    <Card className="mt-6 border-blue-100 bg-blue-50/50 p-5 sm:p-6"><h2 className="font-semibold text-[var(--betanor-navy)]">Talk to our team</h2><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">Open the chat bubble in the lower-right corner to send a message, or contact Betanor for a formal request.</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/contact" className="rounded-lg bg-[var(--betanor-button-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--betanor-button-text)]">Contact Betanor</Link><Link href="/portal" className="inline-flex items-center text-sm font-semibold text-[var(--betanor-blue)] hover:underline">Back to my portal →</Link></div></Card>
  </main>;
}
