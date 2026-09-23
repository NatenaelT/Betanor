import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";
import { SupportRealtimeBridge } from "@/components/support/support-realtime-bridge";

// This route queries tables added by the paired support migration; generated
// database types are refreshed only after applying that migration.
/* eslint-disable @typescript-eslint/no-explicit-any */

const views: Record<string,{title:string; table:string; fields:string[]; permission?:string}> = {
 customers:{title:"Customers",table:"support_contracts",fields:["code","title","customer_id","project_id","status"]},
 contracts:{title:"Support contracts",table:"support_contracts",fields:["code","title","customer_id","sla_id","service_scope","status","starts_on","ends_on"],permission:"support.manage_contracts"},
 tickets:{title:"Support tickets",table:"support_tickets",fields:["ticket_number","title","customer_id","priority","status","assigned_employee_id","resolution_due_at"]},
 remote:{title:"Remote support",table:"support_sessions",fields:["ticket_id","session_type","starts_at","ends_at","provider","status","work_log"]},
 onsite:{title:"On-site support",table:"support_schedule_entries",fields:["title","customer_id","scheduled_for","weekday","starts_at","ends_at","location","entry_type"],permission:"support.manage_schedule"},
 assets:{title:"Asset management",table:"support_assets",fields:["asset_tag","asset_type","brand","model","operating_system","location","status"],permission:"support.manage_assets"},
 lifecycle:{title:"Onboarding / offboarding",table:"support_lifecycle_records",fields:["employee_name","employee_email","lifecycle_type","status","due_on"],permission:"support.manage_assets"},
 calendar:{title:"Support schedule / calendar",table:"support_schedule_entries",fields:["title","customer_id","scheduled_for","weekday","starts_at","ends_at","location","entry_type"]},
 tasks:{title:"Support tasks",table:"support_task_links",fields:["task_id","ticket_id","customer_id","created_at"]},
 documents:{title:"Support documents",table:"document_links",fields:["document_id","entity_type","entity_id","created_at"]},
 sla:{title:"SLA tracking",table:"support_sla_policies",fields:["name","first_response_minutes","resolution_minutes","support_hours","is_active"]},
 activity:{title:"Activity history",table:"support_ticket_events",fields:["ticket_id","event_type","body","actor_profile_id","created_at"]},
 reports:{title:"Reports",table:"support_tickets",fields:["ticket_number","priority","status","created_at","resolved_at"],permission:"support.view_reports"},
};
const text = (value: unknown) => value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);

export default async function SupportSectionPage({params}:{params:Promise<{section:string}>}) {
 const {section}=await params; const view=views[section]; if(!view) notFound();
 const supabase=await createClient(); const access=await resolveWorkspace(supabase);
 if(!access.workspaceId || !(access.permissions.has("support.read")||access.permissions.has("support.view_all")||access.permissions.has("support.create"))) redirect("/workspace");
 if(view.permission && !access.permissions.has(view.permission) && !access.permissions.has("support.view_all")) redirect("/workspace/support");
 const db=supabase as any;
 const selectFields=view.table==="document_links"?view.fields:["id",...view.fields];
 let query=db.from(view.table).select(selectFields.join(",")).limit(50);
 if(!["support_ticket_events","support_task_links","document_links","support_sessions"].includes(view.table)) query=query.eq("workspace_id",access.workspaceId);
 if(view.table==="support_ticket_events") query=query.order("created_at",{ascending:false});
 else if(view.table==="document_links") query=query.eq("entity_type","support_ticket");
 else query=query.order("created_at",{ascending:false});
 const {data,error}=await query;
 const rows=data??[];
 const canCreate=section==="tickets"&&access.permissions.has("support.create");
 return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10"><SupportRealtimeBridge workspaceId={access.workspaceId}/><Link href="/workspace/support" className="text-sm font-semibold text-[var(--betanor-blue)]">← Support dashboard</Link><div className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold tracking-[.14em] text-[var(--betanor-blue)] uppercase">RTSL · Managed support</p><h1 className="mt-2 text-3xl font-semibold text-[var(--betanor-navy)]">{view.title}</h1><p className="mt-2 text-sm text-[var(--betanor-muted)]">Showing up to 50 records; customer data is filtered by your support permissions.</p></div>{canCreate?<Link href="/workspace/support/tickets/new" className="rounded-lg bg-[var(--betanor-blue)] px-4 py-2.5 text-sm font-semibold text-white">＋ Create ticket</Link>:null}</div>
 {error?<Card className="mt-6 p-5 text-sm text-amber-800">This list needs the IT Support migration applied before it can load.</Card>:rows.length?<Card className="mt-6 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{view.fields.map(f=><th key={f} className="px-4 py-3">{f.replaceAll("_"," ")}</th>)}</tr></thead><tbody>{rows.map((row:any,i:number)=><tr key={row.id??i} className="border-b last:border-0">{view.fields.map((f,j)=><td key={f} className="max-w-72 px-4 py-3 text-[var(--betanor-text)]">{f==="ticket_number"?<Link className="font-semibold text-[var(--betanor-blue)] hover:underline" href={`/workspace/support/tickets/${row.id}`}>{text(row[f])}</Link>:<span className={j===0?"font-medium":""}>{text(row[f])}</span>}</td>)}</tr>)}</tbody></table></Card>:<Card className="mt-6 p-8 text-center text-sm text-[var(--betanor-muted)]">No {view.title.toLowerCase()} records yet.</Card>}</main>;
}
