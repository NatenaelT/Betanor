import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function tone(status: string): "draft" | "info" | "success" | "warning" {
  return status === "SENT" ? "success" : status === "FAILED" ? "warning" : "draft";
}

export default async function EmailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.hasStaffRole || !access.permissions.has("email.read") && !access.permissions.has("email.read_all")) redirect("/workspace");
  const [{ data: message }, { data: links }] = await Promise.all([
    supabase.from("email_messages").select("*").eq("id", id).eq("workspace_id", access.workspaceId).maybeSingle(),
    supabase.from("email_message_links").select("id,module,record_id,record_label").eq("email_message_id", id),
  ]);
  if (!message) notFound();
  const followupQuery = new URLSearchParams({
    to: message.to_addresses.join("; "),
    subject: message.subject.startsWith("Re:") ? message.subject : `Re: ${message.subject}`,
    parentMessageId: message.id,
  });
  return <main className="mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
    <Link href="/workspace/emails" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline">← Email register</Link>
    <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Correspondence</p><h1 className="mt-2 break-words text-3xl font-semibold text-[var(--betanor-navy)]">{message.subject}</h1><p className="mt-2 text-sm text-[var(--betanor-muted)]">{new Date(message.sent_at || message.created_at).toLocaleString("en-ET")}</p></div><Badge tone={tone(message.status)}>{message.status}</Badge></div>
    <Card className="mt-6 p-5 sm:p-7">
      <dl className="grid gap-4 border-b border-[var(--betanor-border)] pb-5 text-sm sm:grid-cols-2"><div><dt className="text-xs text-[var(--betanor-muted)]">From</dt><dd className="mt-1 break-all font-medium text-[var(--betanor-navy)]">{message.sender_name} · {message.sender_email}</dd></div><div><dt className="text-xs text-[var(--betanor-muted)]">To</dt><dd className="mt-1 break-all font-medium text-[var(--betanor-navy)]">{message.to_addresses.join(", ")}</dd></div>{message.cc_addresses.length ? <div className="sm:col-span-2"><dt className="text-xs text-[var(--betanor-muted)]">CC</dt><dd className="mt-1 break-all">{message.cc_addresses.join(", ")}</dd></div> : null}</dl>
      <article className="mt-6 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--betanor-text)]">{message.body_text}</article>
      {links?.length ? <section className="mt-8 border-t border-[var(--betanor-border)] pt-5"><h2 className="text-sm font-semibold text-[var(--betanor-navy)]">Related records</h2><ul className="mt-3 flex flex-wrap gap-2">{links.map((link) => <li key={link.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs">{link.module.replaceAll("_", " ")}: {link.record_label}</li>)}</ul></section> : null}
      {message.delivery_error ? <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{message.delivery_error}</p> : null}
      <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--betanor-border)] pt-5"><Link href={"/workspace/emails/new?" + followupQuery.toString()}><Button variant="outline">Create follow-up</Button></Link>{message.status === "DRAFT" && access.permissions.has("email.send") ? <Link href={"/workspace/emails/" + message.id + "/edit"}><Button>Edit draft</Button></Link> : null}</div>
    </Card>
  </main>;
}
