import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function tone(status: string): "draft" | "info" | "success" | "warning" {
  return status === "SENT" ? "success" : status === "FAILED" ? "warning" : "draft";
}

export default async function EmailsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const search = await searchParams;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.hasStaffRole || !access.permissions.has("email.read") && !access.permissions.has("email.read_all")) redirect("/workspace");
  const page = Math.max(1, Number(search.page || 1) || 1);
  const pageSize = 20;
  const term = (search.search || "").trim().replace(/[,%()]/g, " ").slice(0, 80);
  let query = supabase.from("email_messages").select("id,sender_email,sender_name,to_addresses,cc_addresses,subject,status,sent_at,created_at", { count: "exact" })
    .eq("workspace_id", access.workspaceId).order("created_at", { ascending: false });
  if (term) query = query.or(`subject.ilike.%${term}%,sender_email.ilike.%${term}%`);
  if (["DRAFT", "SENT", "FAILED"].includes(search.status || "")) query = query.eq("status", search.status as "DRAFT" | "SENT" | "FAILED");
  const { data: messages, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  const ids = (messages ?? []).map((message) => message.id);
  const { data: links } = ids.length ? await supabase.from("email_message_links").select("email_message_id,module,record_label").in("email_message_id", ids) : { data: [] as { email_message_id: string; module: string; record_label: string }[] };
  const linkMap = new Map<string, typeof links>();
  for (const link of links ?? []) linkMap.set(link.email_message_id, [...(linkMap.get(link.email_message_id) ?? []), link]);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const queryString = new URLSearchParams();
  if (search.search) queryString.set("search", search.search);
  if (search.status) queryString.set("status", search.status);
  const baseQuery = queryString.toString();

  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Communications</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Emails</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Business email sent from Betanor, with messages linked to letters, projects, tasks, tenders, and customer records.</p></div>{access.permissions.has("email.send") ? <Link href="/workspace/emails/new"><Button>Compose email</Button></Link> : null}</div>
    <Card className="mt-8 p-4 sm:p-5"><form method="get" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]"><input name="search" defaultValue={search.search || ""} placeholder="Search subject or sender" className="min-h-10 rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 text-sm" /><select name="status" defaultValue={search.status || ""} className="min-h-10 rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="SENT">Sent</option><option value="FAILED">Failed</option></select><Button type="submit" variant="outline">Search</Button></form></Card>
    {error ? <Card className="mt-5 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Email records could not be loaded: {error.message}</Card> : null}
    <Card className="mt-5 overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 border-b border-[var(--betanor-border)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--betanor-muted)] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]"><span>Subject / links</span><span>To</span><span>Status</span><span className="hidden sm:block">Date</span></div>
      {(messages ?? []).length ? messages!.map((message) => <Link key={message.id} href={`/workspace/emails/${message.id}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--betanor-border)] px-4 py-4 last:border-0 hover:bg-slate-50 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{message.subject}</p><p className="mt-1 truncate text-xs text-[var(--betanor-muted)]">{(linkMap.get(message.id) ?? []).map((link) => link.record_label).join(" · ") || `From ${message.sender_name}`}</p></div>
        <span className="truncate text-xs text-[var(--betanor-text)]">{message.to_addresses.join(", ")}</span><Badge tone={tone(message.status)}>{message.status}</Badge><time className="hidden whitespace-nowrap text-xs text-[var(--betanor-muted)] sm:block">{new Date(message.sent_at || message.created_at).toLocaleString("en-ET")}</time>
      </Link>) : <p className="px-5 py-12 text-center text-sm text-[var(--betanor-muted)]">No messages match this view yet. Drafts and sent messages will appear here.</p>}
    </Card>
    <div className="mt-4 flex items-center justify-between text-sm text-[var(--betanor-muted)]"><span>{count ?? 0} message{count === 1 ? "" : "s"} · page {page} of {totalPages}</span><div className="flex gap-2"><Link aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none rounded-lg border px-3 py-2 opacity-40" : "rounded-lg border px-3 py-2"} href={`/workspace/emails?${baseQuery ? `${baseQuery}&` : ""}page=${page - 1}`}>Previous</Link><Link aria-disabled={page >= totalPages} className={page >= totalPages ? "pointer-events-none rounded-lg border px-3 py-2 opacity-40" : "rounded-lg border px-3 py-2"} href={`/workspace/emails?${baseQuery ? `${baseQuery}&` : ""}page=${page + 1}`}>Next</Link></div></div>
  </main>;
}
