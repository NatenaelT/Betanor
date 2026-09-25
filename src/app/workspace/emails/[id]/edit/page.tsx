import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EmailComposeForm } from "@/components/emails/email-compose-form";
import { Card } from "@/components/ui/card";
import { isEmailDeliveryConfigured } from "@/lib/emails/server";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export default async function EditEmailDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.userId || !access.hasStaffRole || !access.permissions.has("email.send")) redirect("/workspace");
  const [{ data: message }, { data: linked }] = await Promise.all([
    supabase.from("email_messages").select("id,sender_profile_id,to_addresses,cc_addresses,subject,body_text,status,parent_message_id").eq("id", id).eq("workspace_id", access.workspaceId).maybeSingle(),
    supabase.from("email_message_links").select("module,record_id,record_label").eq("email_message_id", id),
  ]);
  if (!message || message.sender_profile_id !== access.userId || message.status !== "DRAFT") notFound();
  const initialLinks = (linked ?? []).map((link) => ({ module: link.module, recordId: link.record_id, recordLabel: link.record_label }));
  return <main className="mx-auto max-w-4xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
    <Link href={`/workspace/emails/${id}`} className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">← Back to draft</Link>
    <div className="mt-5"><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Communications</p><h1 className="mt-2 text-3xl font-semibold text-[var(--betanor-navy)]">Edit email draft</h1></div>
    <Card className="mt-6 p-4 text-sm text-[var(--betanor-muted)]">This draft is visible only to its sender and authorized email administrators.</Card>
    <div className="mt-6"><EmailComposeForm initialTo={message.to_addresses.join("; ")} initialCc={message.cc_addresses.join("; ")} initialSubject={message.subject} initialBody={message.body_text} initialLinks={initialLinks} initialMessageId={id} parentMessageId={message.parent_message_id || undefined} deliveryConfigured={isEmailDeliveryConfigured()} /></div>
  </main>;
}
