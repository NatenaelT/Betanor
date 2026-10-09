"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { saveNavigationSettings } from "@/app/workspace/admin/settings/actions";
import { Button } from "@/components/ui/button";
import { CUSTOMER_NAVIGATION_ITEMS, normalizeNavigationSettings, STAFF_NAVIGATION_SECTIONS, type NavigationSettings } from "@/lib/navigation-settings";

function moveItem(items: string[], id: string, delta: -1 | 1) {
  const index = items.indexOf(id);
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const reordered = [...items];
  [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
  return reordered;
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export function NavigationSettingsPanel({ workspaceId, initialSettings }: { workspaceId: string; initialSettings: NavigationSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState(() => normalizeNavigationSettings(initialSettings));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");

  function changeStaff(updater: (current: NavigationSettings["staff"]) => NavigationSettings["staff"]) {
    setSettings((current) => ({ ...current, staff: updater(current.staff) }));
  }

  function changeCustomer(updater: (current: NavigationSettings["customer"]) => NavigationSettings["customer"]) {
    setSettings((current) => ({ ...current, customer: updater(current.customer) }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const result = await saveNavigationSettings(form);
    setBusy(false);
    if (!result.success) { setFailure(result.error || "Navigation could not be saved."); return; }
    setNotice("Navigation preferences saved and applied.");
    router.refresh();
  }

  return <section className="mt-8 rounded-2xl border border-[var(--betanor-border)] bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--betanor-blue)]">Personalize navigation</p><h2 className="mt-2 text-lg font-semibold text-[var(--betanor-navy)]">Order and show or hide menu items</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--betanor-muted)]">Changes apply to the staff sidebar and customer-facing navigation after saving. Role permissions still control staff access; hiding a link does not grant or revoke access to its module.</p></div></div>
    <form onSubmit={save} className="mt-5 space-y-5">
      <input type="hidden" name="workspaceId" value={workspaceId}/>
      <input type="hidden" name="staffNavigation" value={JSON.stringify(settings.staff)}/>
      <input type="hidden" name="customerNavigation" value={JSON.stringify(settings.customer)}/>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-[var(--betanor-border)] p-4">
          <div className="mb-3"><h3 className="text-sm font-semibold text-[var(--betanor-navy)]">Staff workspace · left navigation</h3><p className="mt-1 text-xs text-[var(--betanor-muted)]">Move sections and links, or hide them from the sidebar.</p></div>
          <div className="space-y-3">
            {settings.staff.sectionOrder.map((sectionId, sectionIndex) => {
              const section = STAFF_NAVIGATION_SECTIONS.find((item) => item.id === sectionId);
              if (!section) return null;
              const itemOrder = settings.staff.itemOrder[sectionId] ?? section.items.map((item) => item.id);
              const sectionHidden = settings.staff.hiddenSections.includes(sectionId);
              return <fieldset key={sectionId} className={`rounded-lg border p-3 ${sectionHidden ? "border-slate-200 bg-slate-50 opacity-75" : "border-[var(--betanor-border)]"}`}>
                <div className="flex items-center gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold text-[var(--betanor-navy)]"><input type="checkbox" checked={!sectionHidden} onChange={() => changeStaff((current) => ({ ...current, hiddenSections: toggleValue(current.hiddenSections, sectionId) }))}/><span className="truncate">{section.label}</span></label>
                  <button type="button" disabled={sectionIndex === 0} onClick={() => changeStaff((current) => ({ ...current, sectionOrder: moveItem(current.sectionOrder, sectionId, -1) }))} aria-label={`Move ${section.label} section up`} className="grid size-8 place-items-center rounded-md border border-[var(--betanor-border)] text-xs text-[var(--betanor-navy)] disabled:opacity-40">↑</button>
                  <button type="button" disabled={sectionIndex === settings.staff.sectionOrder.length - 1} onClick={() => changeStaff((current) => ({ ...current, sectionOrder: moveItem(current.sectionOrder, sectionId, 1) }))} aria-label={`Move ${section.label} section down`} className="grid size-8 place-items-center rounded-md border border-[var(--betanor-border)] text-xs text-[var(--betanor-navy)] disabled:opacity-40">↓</button>
                </div>
                <ul className="mt-2 space-y-1 border-t border-[var(--betanor-border)] pt-2">
                  {itemOrder.map((itemId, itemIndex) => {
                    const item = section.items.find((entry) => entry.id === itemId);
                    if (!item) return null;
                    const hidden = settings.staff.hiddenItems.includes(itemId);
                    return <li key={itemId} className="flex items-center gap-2">
                      <label className="flex min-w-0 flex-1 items-center gap-2 py-1 text-xs text-[var(--betanor-text)]"><input type="checkbox" checked={!hidden} onChange={() => changeStaff((current) => ({ ...current, hiddenItems: toggleValue(current.hiddenItems, itemId) }))}/><span className="truncate">{item.label}</span></label>
                      <button type="button" disabled={itemIndex === 0} onClick={() => changeStaff((current) => ({ ...current, itemOrder: { ...current.itemOrder, [sectionId]: moveItem(current.itemOrder[sectionId] ?? itemOrder, itemId, -1) } }))} aria-label={`Move ${item.label} up`} className="grid size-7 place-items-center rounded-md text-xs text-[var(--betanor-muted)] hover:bg-slate-100 disabled:opacity-30">↑</button>
                      <button type="button" disabled={itemIndex === itemOrder.length - 1} onClick={() => changeStaff((current) => ({ ...current, itemOrder: { ...current.itemOrder, [sectionId]: moveItem(current.itemOrder[sectionId] ?? itemOrder, itemId, 1) } }))} aria-label={`Move ${item.label} down`} className="grid size-7 place-items-center rounded-md text-xs text-[var(--betanor-muted)] hover:bg-slate-100 disabled:opacity-30">↓</button>
                    </li>;
                  })}
                </ul>
              </fieldset>;
            })}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--betanor-border)] p-4">
          <div className="mb-3"><h3 className="text-sm font-semibold text-[var(--betanor-navy)]">Customer website and portal · top navigation</h3><p className="mt-1 text-xs text-[var(--betanor-muted)]">Public links appear on the website; portal links appear after customer sign-in. Shared links appear on both.</p></div>
          <ul className="space-y-1">
            {settings.customer.order.map((itemId, index) => {
              const item = CUSTOMER_NAVIGATION_ITEMS.find((entry) => entry.id === itemId);
              if (!item) return null;
              const hidden = settings.customer.hidden.includes(itemId);
              const surface = item.surface === "shared" ? "Website + portal" : item.surface === "public" ? "Website" : "Portal";
              return <li key={itemId} className="flex items-center gap-2 rounded-lg border border-[var(--betanor-border)] px-3 py-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-[var(--betanor-text)]"><input type="checkbox" checked={!hidden} onChange={() => changeCustomer((current) => ({ ...current, hidden: toggleValue(current.hidden, itemId) }))}/><span className="min-w-0"><span className="block truncate font-semibold">{item.label}</span><span className="text-[10px] text-[var(--betanor-muted)]">{surface}</span></span></label>
                <button type="button" disabled={index === 0} onClick={() => changeCustomer((current) => ({ ...current, order: moveItem(current.order, itemId, -1) }))} aria-label={`Move ${item.label} up`} className="grid size-8 place-items-center rounded-md border border-[var(--betanor-border)] text-xs text-[var(--betanor-navy)] disabled:opacity-40">↑</button>
                <button type="button" disabled={index === settings.customer.order.length - 1} onClick={() => changeCustomer((current) => ({ ...current, order: moveItem(current.order, itemId, 1) }))} aria-label={`Move ${item.label} down`} className="grid size-8 place-items-center rounded-md border border-[var(--betanor-border)] text-xs text-[var(--betanor-navy)] disabled:opacity-40">↓</button>
              </li>;
            })}
          </ul>
        </div>
      </div>
      {failure ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{failure}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p> : null}
      <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? "Saving navigation…" : "Save navigation"}</Button></div>
    </form>
  </section>;
}
