import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailComposeForm } from "@/components/emails/email-compose-form";
import { Button } from "@/components/ui/button";
import { isEmailDeliveryConfigured } from "@/lib/emails/server";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export default async function NewEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.hasStaffRole || !access.permissions.has("email.send")) redirect("/workspace");
  const moduleName = params.relatedModule || "";
  const id = params.relatedId || "";
  const label = params.relatedLabel || "";
  const initialLink = moduleName && id && label ? { module: moduleName, recordId: id, recordLabel: label } : undefined;
  return <main className="mx-auto max-w-4xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
    <Link href="/workspace/emails" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">← Email register</Link>
    <div className="mt-5 flex items-end justify-between gap-3"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Communications</p><h1 className="mt-2 text-3xl font-semibold text-[var(--betanor-navy)]">Compose email</h1><p className="mt-2 text-sm text-[var(--betanor-muted)]">Messages are stored in the portal and can be linked to the business record they concern.</p></div><Link href="/workspace/help"><Button variant="outline" size="sm">Email help</Button></Link></div>
    <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"><strong>Sender:</strong> outgoing mail uses Betanor’s configured SMTP address. Replies go to your staff account email.</div>
    <div className="mt-6"><EmailComposeForm initialTo={params.to || ""} initialSubject={params.subject || ""} initialLink={initialLink} parentMessageId={params.parentMessageId} deliveryConfigured={isEmailDeliveryConfigured()} /></div>
  </main>;
}
