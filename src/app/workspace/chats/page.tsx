import { revalidatePath } from "next/cache";
import Link from "next/link";

import { ChatComposer } from "@/components/chat/chat-composer";
import type { ChatMessageRecord } from "@/components/chat/chat-message";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { ChatRealtimeBridge } from "@/components/chat/chat-realtime-bridge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 40;

async function startInternalChat(data: FormData) {
  "use server";
  const topic = String(data.get("topic") ?? "").trim();
  const body = String(data.get("body") ?? "").trim();
  if (!body) return;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.hasStaffRole || !access.permissions.has("chat.manage")) return;
  await supabase.rpc("start_internal_chat", { topic_input: topic || null, message_input: body });
  revalidatePath("/workspace/chats");
}

async function updateConversationStatus(data: FormData) {
  "use server";
  const id = String(data.get("conversationId") ?? "").trim();
  const status = String(data.get("status") ?? "").trim();
  if (!id || !["waiting", "open", "resolved", "closed"].includes(status)) return;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.permissions.has("chat.manage")) return;
  await supabase.from("chat_conversations").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", access.workspaceId);
  revalidatePath("/workspace/chats");
}

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ conversation?: string; q?: string; page?: string }> }) {
  const { conversation: requestedId, q: rawQuery, page: rawPage } = await searchParams;
  const query = (rawQuery || "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number(rawPage) || 1));
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  const canManageChat = access.hasStaffRole && access.permissions.has("chat.manage");
  if (!access.workspaceId || !(canManageChat || (access.hasStaffRole && access.permissions.has("chat.internal.read")))) return <main className="mx-auto max-w-5xl px-5 py-10"><h1 className="text-2xl font-semibold">Chat access is required</h1><p className="mt-2 text-sm text-[var(--betanor-muted)]">Ask an administrator for chat access.</p></main>;

  let listQuery = supabase.from("chat_conversations")
    .select("id,reference,customer_id,guest_name,topic,status,updated_at,telegram_group_bindings(telegram_username,title)", { count: "exact" })
    .eq("workspace_id", access.workspaceId)
    .order("updated_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (query) {
    const safe = query.replace(/[,()%]/g, " ");
    listQuery = listQuery.or(`reference.ilike.%${safe}%,topic.ilike.%${safe}%,guest_name.ilike.%${safe}%`);
  }
  const { data: conversations, count, error } = await listQuery;
  let visibleConversations = conversations ?? [];
  if (requestedId && !visibleConversations.some((item) => item.id === requestedId)) {
    const { data: linkedConversation } = await supabase.from("chat_conversations")
      .select("id,reference,customer_id,guest_name,topic,status,updated_at,telegram_group_bindings(telegram_username,title)")
      .eq("workspace_id", access.workspaceId).eq("id", requestedId).maybeSingle();
    if (linkedConversation) visibleConversations = [linkedConversation, ...visibleConversations];
  }
  const selectedId = requestedId && visibleConversations.some((item) => item.id === requestedId) ? requestedId : visibleConversations[0]?.id;
  const selected = visibleConversations.find((item) => item.id === selectedId);
  const { data: newestMessages } = selectedId
    ? await supabase.from("chat_messages")
      .select("id,body,sender_kind,sender_profile_id,is_internal,read_at,edited_at,deleted_at,attachment_name,task_id,telegram_sender_label,created_at")
      .eq("conversation_id", selectedId).order("created_at", { ascending: false }).limit(100)
    : { data: null };
  const messages = ((newestMessages ?? []) as ChatMessageRecord[]).reverse();
  const telegramGroup = selected ? (Array.isArray(selected.telegram_group_bindings) ? selected.telegram_group_bindings[0] : selected.telegram_group_bindings) : null;
  const selectedTitle = telegramGroup?.title || (selected?.customer_id ? selected.guest_name || "Customer" : selected?.guest_name || "Staff conversation");
  const listHref = (targetPage: number) => `/workspace/chats?page=${targetPage}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  return <main className="mx-auto max-w-[1600px] px-3 py-5 sm:px-5 lg:px-7 lg:py-7">
    <ChatRealtimeBridge workspaceId={access.workspaceId} conversationId={selectedId} />
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--betanor-blue)]">Communication</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--betanor-navy)] sm:text-3xl">Messages</h1><p className="mt-1 text-sm text-[var(--betanor-muted)]">Customer conversations and private staff discussions in one place.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">● Live inbox</span></div>
    <div className="grid min-h-[min(72vh,720px)] overflow-hidden rounded-2xl border border-[var(--betanor-border)] bg-white shadow-[0_15px_50px_-35px_rgba(8,31,64,.45)] lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      <aside className={`min-w-0 flex min-h-72 flex-col border-b border-[var(--betanor-border)] lg:min-h-0 lg:border-r lg:border-b-0 ${selected ? "hidden lg:flex" : "flex"}`}>
        <div className="border-b border-[var(--betanor-border)] p-3 sm:p-4"><form method="get"><label htmlFor="chat-search" className="sr-only">Search conversations</label><input id="chat-search" name="q" defaultValue={query} placeholder="Search conversations…" className="min-h-10 w-full rounded-xl border border-[var(--betanor-border)] bg-slate-50 px-3 text-sm outline-none focus:border-[var(--betanor-blue)]" /></form>
          {canManageChat ? <details className="mt-3 rounded-xl border border-[var(--betanor-border)]"><summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-[var(--betanor-navy)]">＋ New staff conversation</summary><form action={startInternalChat} className="space-y-2 p-3 pt-0"><input name="topic" placeholder="Topic" className="min-h-9 w-full rounded-lg border border-[var(--betanor-border)] px-2 text-sm"/><textarea required name="body" rows={2} placeholder="First message" className="w-full rounded-lg border border-[var(--betanor-border)] px-2 py-1.5 text-sm"/><Button type="submit" size="sm">Start conversation</Button></form></details> : null}
        </div>
        <nav aria-label="Conversations" className="max-h-[70vh] flex-1 overflow-y-auto lg:max-h-[65vh]">
          {error ? <p className="p-4 text-sm text-rose-700">Could not load conversations: {error.message}</p> : visibleConversations.length ? visibleConversations.map((item) => {
            const group = Array.isArray(item.telegram_group_bindings) ? item.telegram_group_bindings[0] : item.telegram_group_bindings;
            const title = group?.title || (item.customer_id ? item.guest_name || "Customer" : item.guest_name || "Staff conversation");
            return <Link key={item.id} href={`/workspace/chats?conversation=${item.id}${query ? `&q=${encodeURIComponent(query)}` : ""}&page=${page}`} className={`block border-b border-slate-100 px-4 py-3 transition-colors hover:bg-blue-50/60 focus-visible:bg-blue-50 ${selectedId === item.id ? "border-l-[3px] border-l-[var(--betanor-blue)] bg-blue-50" : "border-l-[3px] border-l-transparent"}`}><div className="flex items-start justify-between gap-2"><span className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{title}</span><time className="shrink-0 text-[10px] text-[var(--betanor-muted)]">{new Date(item.updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</time></div><p className="mt-0.5 truncate text-xs text-[var(--betanor-muted)]">{item.topic || item.reference}</p><span className="mt-1.5 inline-block text-[10px] font-medium capitalize text-[var(--betanor-blue)]">{group ? "Telegram group · read only" : item.customer_id ? "Customer" : "Internal"} · {item.status}</span></Link>;
          }) : <p className="p-4 text-sm text-[var(--betanor-muted)]">No conversations found.</p>}
        </nav>
        {(count ?? 0) > PAGE_SIZE ? <div className="flex justify-between border-t border-[var(--betanor-border)] p-3 text-xs"><span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count ?? 0)} of {count}</span><div className="flex gap-3">{page > 1 ? <Link href={listHref(page - 1)} className="font-semibold text-[var(--betanor-blue)]">Previous</Link> : null}{page * PAGE_SIZE < (count ?? 0) ? <Link href={listHref(page + 1)} className="font-semibold text-[var(--betanor-blue)]">Next</Link> : null}</div></div> : null}
      </aside>
      <section className={`min-w-0 flex min-h-[430px] flex-col ${selected ? "flex" : "hidden lg:flex"}`} aria-label="Selected conversation">
        {selected ? <><header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--betanor-border)] px-4 py-3 sm:px-5">{requestedId ? <Link href={listHref(page)} aria-label="Back to conversations" className="grid size-11 shrink-0 place-items-center rounded-lg border border-[var(--betanor-border)] text-lg text-[var(--betanor-navy)] hover:bg-slate-50 lg:hidden">←</Link> : null}<div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold text-[var(--betanor-navy)]">{selectedTitle}</h2><p className="mt-0.5 truncate text-xs text-[var(--betanor-muted)]">{selected.reference} · {selected.topic || "General enquiry"}</p></div>{canManageChat && !telegramGroup ? <form action={updateConversationStatus} className="flex items-center gap-2"><input type="hidden" name="conversationId" value={selected.id}/><label htmlFor="chat-status" className="sr-only">Status</label><select id="chat-status" name="status" defaultValue={selected.status} className="min-h-11 rounded-lg border border-[var(--betanor-border)] bg-white px-2 text-xs"><option value="waiting">Waiting</option><option value="open">Open</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select><Button type="submit" size="sm" variant="outline">Save</Button></form> : null}</header>
          <ChatMessageList messages={messages} viewerId={access.userId}/>
          {telegramGroup ? <div className="border-t border-[var(--betanor-border)] px-4 py-3 text-xs text-[var(--betanor-muted)]">This is a read-only mirror of {telegramGroup.telegram_username ? `@${telegramGroup.telegram_username}` : "the staff Telegram group"}. Continue the conversation in Telegram.</div> : canManageChat ? <div className="border-t border-[var(--betanor-border)] px-3 pb-3 sm:px-5"><ChatComposer conversationId={selected.id} senderKind="agent" isInternal={!selected.customer_id} placeholder={selected.customer_id ? "Reply to customer…" : "Message your team…"}/></div> : null}</> : <div className="m-auto px-6 text-center"><p className="text-lg font-semibold text-[var(--betanor-navy)]">Your conversations appear here</p><p className="mt-2 text-sm text-[var(--betanor-muted)]">Select a conversation to read and reply.</p></div>}
      </section>
    </div>
  </main>;
}
