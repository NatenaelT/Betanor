"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

type Customer = { id: string; name: string | null; legal_name: string | null; email: string | null; phone: string | null; status: string | null };
type Profile = { id: string; full_name: string | null; email_address: string | null; account_type: "staff" | "customer" | null; is_active: boolean };
type PortalAccess = { id: string; customer_id: string; profile_id: string; access_level: "customer_viewer" | "customer_admin"; is_active: boolean; created_at: string; customer?: Customer | null; profile?: Profile | null; customers?: Customer | Customer[] | null; profiles?: Profile | Profile[] | null };

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

export function CustomerPortalAccessPanel() {
  const [accessRows, setAccessRows] = useState<PortalAccess[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<PortalAccess | null>(null);
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [accessLevel, setAccessLevel] = useState<"customer_viewer" | "customer_admin">("customer_admin");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const result = await requestJson("/api/admin/customer-portal-access", { cache: "no-store" });
      setAccessRows(result.access ?? []);
      setCustomers(result.customers ?? []);
      setProfiles(result.profiles ?? []);
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Could not load customer portal access." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    requestJson("/api/admin/customer-portal-access", { cache: "no-store" }).then((result) => {
      if (!active) return;
      setAccessRows(result.access ?? []);
      setCustomers(result.customers ?? []);
      setProfiles(result.profiles ?? []);
    }).catch((error: unknown) => {
      if (active) setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Could not load customer portal access." });
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  function startCreate() {
    setEditing(null);
    setCustomerId(customers[0]?.id ?? "");
    setProfileId(profiles.find((profile) => profile.account_type === "customer")?.id ?? profiles[0]?.id ?? "");
    setAccessLevel("customer_admin");
    setIsActive(true);
    setNotice(null);
    setOpen(true);
  }

  function startEdit(row: PortalAccess) {
    const customer = relation(row.customer ?? row.customers);
    const profile = relation(row.profile ?? row.profiles);
    setEditing(row);
    setCustomerId(row.customer_id);
    setProfileId(row.profile_id);
    setAccessLevel(row.access_level);
    setIsActive(row.is_active);
    setNotice({ tone: "success", text: `Editing ${customer?.name || customer?.legal_name || profile?.email_address || "portal access"}.` });
    setOpen(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const payload = { id: editing?.id, customerId, profileId, accessLevel, isActive };
      await requestJson("/api/admin/customer-portal-access", { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setOpen(false);
      setNotice({ tone: "success", text: editing ? "Customer portal access updated." : "Customer portal access created." });
      await load();
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Could not save customer portal access." });
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: PortalAccess) {
    const customer = relation(row.customer ?? row.customers);
    if (!window.confirm(`Remove portal access for ${customer?.name || customer?.legal_name || "this customer"}? The customer and business history will remain.`)) return;
    setSaving(true);
    setNotice(null);
    try {
      await requestJson("/api/admin/customer-portal-access", { method: "DELETE", body: JSON.stringify({ id: row.id }) });
      setNotice({ tone: "success", text: "Customer portal access removed." });
      await load();
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Could not remove customer portal access." });
    } finally {
      setSaving(false);
    }
  }

  const noticeClass = notice?.tone === "danger" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  const customerProfiles = profiles.filter((profile) => profile.account_type === "customer" || profile.account_type === "staff");

  return <Card className="mt-8 overflow-hidden">
    {notice ? <div role="status" className={`m-5 rounded-xl border px-4 py-3 text-sm ${noticeClass}`}>{notice.text}</div> : null}
    <div className="flex flex-col justify-between gap-3 border-b border-[var(--betanor-border)] px-5 py-4 sm:flex-row sm:items-center"><div><h2 className="font-semibold text-[var(--betanor-navy)]">Customer portal access</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--betanor-muted)]">Create, update, revoke, and preview customer portal links without changing the customer record or signing out of the administrator session.</p></div><Button size="sm" onClick={startCreate}>New portal access</Button></div>
    {open ? <Modal title={editing ? "Update customer portal access" : "Create customer portal access"} onClose={() => setOpen(false)}><form className="grid gap-4" onSubmit={submit}>
      <div><FieldLabel required htmlFor="portal-customer">Customer</FieldLabel><select id="portal-customer" required value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name || customer.legal_name || "Unnamed customer"}{customer.email ? ` · ${customer.email}` : ""}</option>)}</select></div>
      <div><FieldLabel required htmlFor="portal-profile">Portal user</FieldLabel><select id="portal-profile" required value={profileId} onChange={(event) => setProfileId(event.target.value)} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Select user</option>{customerProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email_address || profile.id}{profile.account_type === "staff" ? " · staff preview" : ""}</option>)}</select><p className="mt-1.5 text-xs leading-5 text-[var(--betanor-muted)]">Staff profiles can be granted a controlled customer preview; customer profiles receive normal portal access.</p></div>
      <div><FieldLabel required htmlFor="portal-access-level">Access level</FieldLabel><select id="portal-access-level" value={accessLevel} onChange={(event) => setAccessLevel(event.target.value as "customer_viewer" | "customer_admin")} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="customer_admin">Customer administrator</option><option value="customer_viewer">Customer viewer</option></select></div>
      <label className="flex items-center gap-3 text-sm font-semibold text-[var(--betanor-navy)]"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Active portal access</label>
      <div className="flex justify-end gap-2 border-t border-[var(--betanor-border)] pt-4"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create access"}</Button></div>
    </form></Modal> : null}
    <div className="divide-y divide-[var(--betanor-border)]">{loading ? <p className="px-5 py-8 text-sm text-[var(--betanor-muted)]">Loading portal access…</p> : accessRows.length ? accessRows.map((row) => { const customer = relation(row.customer ?? row.customers); const profile = relation(row.profile ?? row.profiles); return <div key={row.id} className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{customer?.name || customer?.legal_name || "Customer"}</p><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Revoked"}</Badge><Badge tone="info">{row.access_level === "customer_admin" ? "Admin" : "Viewer"}</Badge></div><p className="mt-1 truncate text-xs text-[var(--betanor-muted)]">{profile?.full_name || profile?.email_address || "Portal user"}{profile?.account_type === "staff" ? " · staff preview" : ""}</p></div><div className="flex flex-wrap items-center gap-2"><Link href={`/portal?previewCustomerId=${encodeURIComponent(row.customer_id)}`} className="rounded-lg border border-[var(--betanor-border)] px-3 py-2 text-xs font-semibold text-[var(--betanor-navy)] hover:border-[var(--betanor-blue)]">Open as customer</Link><Button variant="outline" size="sm" onClick={() => startEdit(row)}>Edit</Button><Button variant="danger" size="sm" disabled={saving} onClick={() => void remove(row)}>Remove</Button></div></div>; }) : <p className="px-5 py-8 text-sm text-[var(--betanor-muted)]">No customer portal access records yet. Create one to connect a customer to a portal user.</p>}</div>
  </Card>;
}
