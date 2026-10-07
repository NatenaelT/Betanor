"use client";

import { useStaffPresence } from "@/components/chat/staff-presence-provider";

export type StaffRosterEntry = { profile_id: string; display_name: string; job_title: string | null; employee_number: string | null };

export function StaffPresenceRoster({ staff, currentUserId }: { staff: StaffRosterEntry[]; currentUserId: string | null }) {
  const { onlineIds, enabled } = useStaffPresence();
  const onlineCount = staff.filter((person) => onlineIds.has(person.profile_id)).length;
  return <details className="mt-3 rounded-xl border border-[var(--betanor-border)] bg-white">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-[var(--betanor-navy)] [&::-webkit-details-marker]:hidden">
      <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" />Staff presence</span>
      <span className="text-[10px] font-medium text-[var(--betanor-muted)]">{enabled ? `${onlineCount} online · ${staff.length} staff` : `${staff.length} staff`}</span>
    </summary>
    <div className="max-h-64 space-y-1 overflow-y-auto border-t border-[var(--betanor-border)] p-2">
      {staff.length ? staff.map((person) => {
        const online = enabled && onlineIds.has(person.profile_id);
        return <div key={person.profile_id} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
          <span aria-label={online ? "Online" : "Offline"} title={online ? "Online" : "Offline"} className={`size-2 shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`} />
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[var(--betanor-navy)]">{person.display_name}{person.profile_id === currentUserId ? " · you" : ""}</span><span className="block truncate text-[10px] text-[var(--betanor-muted)]">{person.job_title || person.employee_number || "Betanor staff"}</span></span>
          <span className={`shrink-0 text-[10px] ${online ? "text-emerald-700" : "text-[var(--betanor-muted)]"}`}>{online ? "Online" : "Offline"}</span>
        </div>;
      }) : <p className="px-2 py-3 text-xs text-[var(--betanor-muted)]">No active staff profiles found.</p>}
    </div>
  </details>;
}
