import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { SupportConversation } from "@/components/support/support-conversation";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";
import { SupportTicketActions } from "@/components/support/support-ticket-actions";

/* eslint-disable @typescript-eslint/no-explicit-any -- support relations are migration-backed and not yet in generated Supabase types. */

export default async function SupportTicketPage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params; const supabase=await createClient(); const access=await resolveWorkspace(supabase);
 if(!access.workspaceId) redirect("/workspace"); const db=supabase as any;
 const [{data:ticket},{data:events},{data:conversation},{data:technicians}] = await Promise.all([
  db.from("support_tickets").select("*").eq("id",id).eq("workspace_id",access.workspaceId).maybeSingle(),
  db.from("support_ticket_events").select("id,event_type,body,created_at,is_customer_visible").eq("ticket_id",id).order("created_at",{ascending:false}).limit(50),
  db.from("chat_conversations").select("id").eq("support_ticket_id",id).maybeSingle(),
  access.permissions.has("support.assign") ? db.rpc("support_list_technicians",{p_workspace:access.workspaceId}) : Promise.resolve({data:[]}),
 ]);
 if(!ticket) notFound();
 return <main className="mx-auto max-w-5xl px-5 py-8 sm:px-6 lg:px-8"><p className="text-sm font-semibold text-[var(--betanor-blue)]"><Link href="/workspace/support/tickets">← Support tickets</Link></p><div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--betanor-muted)]">{ticket.ticket_number}</p><h1 className="mt-2 text-3xl font-semibold text-[var(--betanor-navy)]">{ticket.title}</h1><p className="mt-2 text-sm text-[var(--betanor-muted)]">{ticket.priority} priority · {ticket.status} · {ticket.category}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">RTSL support desk</span></div>
 <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]"><Card className="p-5"><h2 className="font-semibold text-[var(--betanor-navy)]">Request details</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{ticket.description}</p><div className="mt-5 grid gap-3 border-t pt-4 text-xs text-[var(--betanor-muted)] sm:grid-cols-2"><p>Created {new Date(ticket.created_at).toLocaleString("en-ET")}</p><p>First response due {ticket.first_response_due_at?new Date(ticket.first_response_due_at).toLocaleString("en-ET"):"—"}</p><p>Resolution due {ticket.resolution_due_at?new Date(ticket.resolution_due_at).toLocaleString("en-ET"):"—"}</p></div><SupportTicketActions ticketId={ticket.id} currentStatus={ticket.status} canRespond={access.permissions.has("support.respond")||access.permissions.has("support.view_all")} technicians={(technicians??[]).map((t:any)=>({id:t.id,label:t.label}))}/></Card><Card className="p-5"><h2 className="font-semibold text-[var(--betanor-navy)]">Service workflow</h2><ol className="mt-4 space-y-3 text-sm text-[var(--betanor-muted)]">{["Request received","Technician assigned","Diagnose","Remote / video / onsite support","Work log","Resolution","Customer confirmation","Close"].map((step,i)=><li key={step} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs">{i+1}</span>{step}</li>)}</ol></Card></div>
 {conversation?.id?<Card className="mt-5 p-5"><div className="flex items-center justify-between"><h2 className="font-semibold text-[var(--betanor-navy)]">Customer communication</h2><button type="button" disabled title="Connect and configure an approved video provider to enable secure calls." className="cursor-not-allowed rounded-lg border px-3 py-2 text-sm text-slate-400">Video provider not configured</button></div><p className="mt-1 text-xs text-[var(--betanor-muted)]">Live chat uses Betanor Realtime and private chat attachments.</p><SupportConversation conversationId={conversation.id} senderKind="agent"/></Card>:null}
 <Card className="mt-5 p-5"><h2 className="font-semibold text-[var(--betanor-navy)]">Activity history</h2><div className="mt-4 space-y-3">{(events??[]).map((event:any)=><div key={event.id} className="border-l-2 border-[var(--betanor-blue)] pl-3"><p className="text-sm font-medium">{event.event_type.replaceAll("_"," ")}</p><p className="text-sm text-[var(--betanor-muted)]">{event.body}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">{new Date(event.created_at).toLocaleString("en-ET")}</p></div>)}</div></Card></main>;
}
