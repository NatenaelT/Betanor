"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { startInternalGroupChat, startDirectStaffChat } from "@/app/workspace/chats/actions";
import { useStaffPresence } from "@/components/chat/staff-presence-provider";

export type StaffRosterEntry = {
  profile_id: string;
  display_name: string;
  job_title: string | null;
  employee_number: string | null;
};

export function StaffPresenceRoster({
  staff,
  currentUserId,
}: {
  staff: StaffRosterEntry[];
  currentUserId: string | null;
}) {
  const { onlineIds, enabled } = useStaffPresence();
  const router = useRouter();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [query, setQuery] = useState("");
  const onlineCount = staff.filter((person) => onlineIds.has(person.profile_id)).length;
  const colleagues = staff.filter((person) => person.profile_id !== currentUserId);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredStaff = normalizedQuery
    ? colleagues.filter((person) => `${person.display_name} ${person.job_title ?? ""}`.toLocaleLowerCase().includes(normalizedQuery))
    : colleagues;

  async function startChat(profileId: string) {
    if (startingId) return;
    setStartingId(profileId);
    setError("");
    try {
      const result = await startDirectStaffChat(profileId);
      if (!result.conversationId) {
        setError(result.error || "The staff chat could not be started.");
        return;
      }
      router.push(`/workspace/chats?view=internal&conversation=${encodeURIComponent(result.conversationId)}`);
    } catch {
      setError("The staff chat could not be started. Check your connection and try again.");
    } finally {
      setStartingId(null);
    }
  }

  return (
    <details className="mt-3 overflow-hidden rounded-xl border border-[var(--betanor-border)] bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-left [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--betanor-navy)] text-sm font-semibold text-white">＋</span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-[var(--betanor-navy)]">New chat</span>
            <span className="block truncate text-[10px] text-[var(--betanor-muted)]">Start a private or group conversation</span>
          </span>
        </span>
        <span className="shrink-0 text-[10px] text-[var(--betanor-muted)]">{enabled ? `${onlineCount} online` : `${colleagues.length} staff`} <span aria-hidden="true">⌄</span></span>
      </summary>

      <div className="border-t border-[var(--betanor-border)]">
        <div aria-label="New conversation type" className="grid grid-cols-2 gap-1 bg-slate-50 p-1.5">
          <button type="button" aria-pressed={mode === "direct"} onClick={() => setMode("direct")} className={`min-h-9 rounded-lg px-2 text-xs font-semibold transition-colors ${mode === "direct" ? "bg-white text-[var(--betanor-navy)] shadow-sm" : "text-[var(--betanor-muted)] hover:bg-white/70"}`}>Direct message</button>
          <button type="button" aria-pressed={mode === "group"} onClick={() => setMode("group")} className={`min-h-9 rounded-lg px-2 text-xs font-semibold transition-colors ${mode === "group" ? "bg-white text-[var(--betanor-navy)] shadow-sm" : "text-[var(--betanor-muted)] hover:bg-white/70"}`}>Group chat</button>
        </div>

        {error ? <p role="alert" className="mx-3 mt-3 rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-700">{error}</p> : null}

        {mode === "direct" ? (
          <div className="p-2.5">
            <label className="sr-only" htmlFor="staff-chat-search">Find a colleague</label>
            <input id="staff-chat-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a colleague…" className="min-h-9 w-full rounded-lg border border-[var(--betanor-border)] bg-slate-50 px-3 text-xs outline-none focus:border-[var(--betanor-blue)]" />
            <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
              {filteredStaff.map((person) => {
                const online = enabled && onlineIds.has(person.profile_id);
                return (
                  <li key={person.profile_id}>
                    <button type="button" disabled={startingId !== null} onClick={() => void startChat(person.profile_id)} aria-label={`Start chat with ${person.display_name}`} className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-blue-50 disabled:opacity-60">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--betanor-navy)] text-[10px] font-bold text-white">{person.display_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
                      <span aria-label={online ? "Online" : "Offline"} className={`size-2 shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[var(--betanor-navy)]">{person.display_name}</span><span className="block truncate text-[10px] text-[var(--betanor-muted)]">{person.job_title || person.employee_number || "Betanor staff"}</span></span>
                      <span className={`shrink-0 text-[10px] ${online ? "text-emerald-700" : "text-[var(--betanor-muted)]"}`}>{startingId === person.profile_id ? "Opening…" : online ? "Online" : "Chat"}</span>
                    </button>
                  </li>
                );
              })}
              {filteredStaff.length === 0 ? <li className="px-2 py-4 text-center text-xs text-[var(--betanor-muted)]">{colleagues.length ? "No colleagues match that search." : "No other staff with chat access are available."}</li> : null}
            </ul>
          </div>
        ) : (
          <form action={startInternalGroupChat} className="space-y-3 p-3">
            <div>
              <label htmlFor="new-group-topic" className="mb-1 block text-[11px] font-semibold text-[var(--betanor-navy)]">Group name <span className="font-normal text-[var(--betanor-muted)]">(optional)</span></label>
              <input id="new-group-topic" name="topic" maxLength={180} placeholder="For example: RTSL rollout" className="min-h-9 w-full rounded-lg border border-[var(--betanor-border)] px-2.5 text-sm outline-none focus:border-[var(--betanor-blue)]" />
            </div>
            <fieldset>
              <legend className="text-[11px] font-semibold text-[var(--betanor-navy)]">Add people <span className="font-normal text-[var(--betanor-muted)]">(choose one or more)</span></legend>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--betanor-border)] p-1.5">
                {filteredStaff.map((person) => {
                  const online = enabled && onlineIds.has(person.profile_id);
                  return <li key={person.profile_id}><label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--betanor-navy)] hover:bg-slate-50"><input type="checkbox" name="recipientIds" value={person.profile_id} /><span className={`size-2 shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`} /><span className="min-w-0 flex-1 truncate">{person.display_name}</span><span className="truncate text-[10px] text-[var(--betanor-muted)]">{person.job_title || "Staff"}</span></label></li>;
                })}
                {filteredStaff.length === 0 ? <li className="px-2 py-3 text-center text-xs text-[var(--betanor-muted)]">No staff match your search.</li> : null}
              </ul>
              <p className="mt-1 text-[10px] leading-4 text-[var(--betanor-muted)]">You are included automatically. Only selected participants and authorized chat managers can see the group.</p>
            </fieldset>
            <textarea name="body" rows={2} maxLength={10000} placeholder="Write a first message (optional)" className="w-full rounded-lg border border-[var(--betanor-border)] px-2.5 py-2 text-sm outline-none focus:border-[var(--betanor-blue)]" />
            <button type="submit" disabled={colleagues.length === 0} className="min-h-9 rounded-lg bg-[var(--betanor-navy)] px-3 text-xs font-semibold text-white transition-colors hover:bg-[var(--betanor-blue)] disabled:cursor-not-allowed disabled:opacity-50">Create group</button>
          </form>
        )}
      </div>
    </details>
  );
}
