import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

async function startInternalChat(data: FormData) {
  "use server";
  const topic = String(data.get("topic") ?? "").trim();
  const body = String(data.get("body") ?? "").trim();
  if (!body) return;
  const supabase = await createClient();
  await supabase.rpc("start_internal_chat", { topic_input: topic || null, message_input: body });
  revalidatePath("/workspace/chats");
}

async function reply(data: FormData) {
  "use server";
  const conversationId = String(data.get("conversationId") ?? "").trim();
  const body = String(data.get("body") ?? "").trim();
  if (!conversationId || !body) return;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const profileId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  if (!profileId) return;
  const { data: conversation } = await supabase.from("chat_conversations").select("customer_id").eq("id", conversationId).maybeSingle();
  await supabase.from("chat_messages").insert({ conversation_id: conversationId, sender_profile_id: profileId, sender_kind: "agent", body, is_internal: !conversation?.customer_id });
  revalidatePath("/workspace/chats");
}

async function updateConversationStatus(data: FormData) {
  "use server";
  const conversationId = String(data.get("conversationId") ?? "").trim();
  const status = String(data.get("status") ?? "").trim();
  if (!conversationId || !["waiting", "open", "resolved", "closed"].includes(status)) return;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.permissions.has("chat.manage")) return;
  await supabase.from("chat_conversations").update({ status, updated_at: new Date().toISOString() }).eq("id", conversationId).eq("workspace_id", access.workspaceId);
  revalidatePath("/workspace/chats");
}

export default async function ChatsPage() {
  const supabase = await createClient();
  const { data: conversations, error } = await supabase.from("chat_conversations").select("id,reference,customer_id,guest_name,guest_email,topic,status,priority,opened_at,chat_messages(id,body,sender_kind,is_internal,created_at)").order("updated_at", { ascending: false }).limit(50);
  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[.14em] text-[var(--betanor-blue)] uppercase">Communication</p><h1 className="mt-3 text-3xl font-semibold text-[var(--betanor-navy)]">Chat workspace</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Handle customer conversations and private staff discussions in one inbox. Internal messages never appear in the customer portal.</p></div><Badge tone="info">Realtime enabled</Badge></div>
    <Card className="mt-8 p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Start an internal conversation</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">Use this for delivery coordination, hand-offs, or sensitive staff communication.</p><form action={startInternalChat} className="mt-4 grid gap-3 md:grid-cols-[.7fr_1.3fr_auto]"><input name="topic" className="min-h-10 rounded-lg border border-[var(--betanor-border)] px-3 text-sm" placeholder="Topic, e.g. Addis deployment"/><input required name="body" className="min-h-10 rounded-lg border border-[var(--betanor-border)] px-3 text-sm" placeholder="Write the first internal message"/><Button type="submit">Start chat</Button></form></Card>
    {error ? <Card className="mt-8 p-6"><p className="font-semibold text-[var(--betanor-navy)]">Chat access is required.</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">Ask an administrator for chat.manage permission.</p></Card> : <div className="mt-8 grid gap-5 lg:grid-cols-2">{conversations?.length ? conversations.map((conversation) => { const isInternal = !conversation.customer_id; return <Card key={conversation.id} className="p-5"><div className="flex justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[var(--betanor-navy)]">{isInternal ? conversation.guest_name || "Internal staff" : conversation.guest_name || "Customer"}</p><Badge tone={isInternal ? "neutral" : "info"}>{isInternal ? "Internal" : "Customer"}</Badge></div><p className="mt-1 text-xs text-[var(--betanor-muted)]">{conversation.reference} · {conversation.topic || "General enquiry"}</p></div><form action={updateConversationStatus} className="flex items-center gap-2"><input type="hidden" name="conversationId" value={conversation.id}/><select name="status" defaultValue={conversation.status} aria-label="Conversation status" className="min-h-8 rounded-lg border border-[var(--betanor-border)] bg-white px-2 text-xs"><option value="waiting">Waiting</option><option value="open">Open</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select><Button type="submit" size="sm" variant="outline">Save</Button></form></div><div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{conversation.chat_messages?.map((message) => <p key={message.id} className={`rounded-lg p-3 text-sm ${message.is_internal ? "bg-slate-100" : "bg-blue-50"}`}><strong>{message.sender_kind === "agent" ? "Staff" : message.sender_kind}:</strong> {message.body}</p>)}</div><form action={reply} className="mt-4"><input type="hidden" name="conversationId" value={conversation.id}/><textarea required name="body" rows={2} className="w-full rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-sm" placeholder={isInternal ? "Reply to staff" : "Reply to client"}/><Button type="submit" size="sm" className="mt-2">Send reply</Button></form></Card>; }) : <Card className="p-8 lg:col-span-2"><p className="font-semibold text-[var(--betanor-navy)]">No conversations yet.</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">Customer chat requests and internal discussions will appear here.</p></Card>}</div>}
  </main>;
}
