"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { PwaSettings } from "@/components/pwa/pwa-settings";

const tabs = [
  { id: "profile", label: "Personal details" },
  { id: "notifications", label: "Notifications" },
  { id: "settings", label: "App settings" },
] as const;
type TabId = (typeof tabs)[number]["id"];

export function ProfileSettingsTabs({ profile, notifications }: { profile: ReactNode; notifications: ReactNode }) {
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return <div className="mt-7">
    <div role="tablist" aria-label="Profile sections" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[var(--betanor-border)] bg-slate-50 p-1">
      {tabs.map((tab, index) => <button key={tab.id} ref={(element) => { tabRefs.current[index] = element; }} id={`profile-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`profile-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => onTabKeyDown(event, index)} className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold transition sm:px-4 sm:text-sm ${activeTab === tab.id ? "bg-white text-[var(--betanor-navy)] shadow-sm" : "text-[var(--betanor-muted)] hover:bg-white/70 hover:text-[var(--betanor-navy)]"}`}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <section key={tab.id} role="tabpanel" id={`profile-panel-${tab.id}`} aria-labelledby={`profile-tab-${tab.id}`} tabIndex={0} hidden={activeTab !== tab.id} className="mt-5 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--betanor-blue)]">
      {tab.id === "profile" ? profile : tab.id === "notifications" ? notifications : <PwaSettings />}
    </section>)}
  </div>;
}
