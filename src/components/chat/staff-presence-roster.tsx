"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { startDirectStaffChat } from "@/app/workspace/chats/actions";
import { useStaffPresence } from "@/components/chat/staff-presence-provider";

export type StaffRosterEntry = { profile_id: string; display_name: string; job_title: string | null; employee_number: string | null };

export function StaffPresenceRoster({ staff, currentUserId }: { staff: StaffRosterEntry[]; currentUserId: string | null }) {
  const { onlineIds, enabled } = useStaffPresence();
  const router = useRouter();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const onlineCount = staff.filter((person) => onlineIds.has(person.profile_id)).length;

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

  return <details open className="mt-3 rounded-xl border border-[var(--betanor-border)] bg-white">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-[var(--betanor-navy)] [&::-webkit-details-marker]:hidden">
      <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" />Staff presence</span>
      <span className="text-[10px] font-medium text-[var(--betanor-muted)]">{enabled ? `${onlineCount} online · ${staff.length} staff` : `${staff.length} staff`}</span>
    </summary>
    <div className="border-t border-[var(--betanor-border)] px-3 pt-2"><p className="text-[10px] text-[var(--betanor-muted)]">Select any colleague to start a direct staff chat.</p></div>
    <div className="max-h-64 space-y-1 overflow-y-auto p-2">
      {error ? <p role="alert" className="rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-700">{error}</p> : null}
      {staff.length ? staff.map((person) => {
        const online = enabled && onlineIds.has(person.profile_id);
        const isSelf = person.profile_id === currentUserId;
        return <button key={person.profile_id} type="button" disabled={isSelf || startingId !== null} onClick={() => void startChat(person.profile_id)} aria-label={isSelf ? `${person.display_name}, you` : `Start chat with ${person.display_name}`} className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-blue-50 disabled:cursor-default disabled:opacity-65">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--betanor-navy)] text-[10px] font-bold text-white">{person.display_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
          <span aria-label={online ? "Online" : "Offline"} title={online ? "Online" : "Offline"} className={`size-2 shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`} />
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[var(--betanor-navy)]">{person.display_name}{isSelf ? " · you" : ""}</span><span className="block truncate text-[10px] text-[var(--betanor-muted)]">{person.job_title || person.employee_number || "Betanor staff"}</span></span>
          <span className={`shrink-0 text-[10px] ${online ? "text-emerald-700" : "text-[var(--betanor-muted)]"}`}>{startingId === person.profile_id ? "Opening…" : online ? "Online · Chat" : isSelf ? "You" : "Chat"}</span>
        </button>;
      }) : <p className="px-2 py-3 text-xs text-[var(--betanor-muted)]">No active staff profiles found.</p>}
    </div>
  </details>;
}
