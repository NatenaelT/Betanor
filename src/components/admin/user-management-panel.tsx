"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldHint, FieldLabel, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

type AccountType = "staff" | "customer";
type Role = { id: string; code: string; name: string; description?: string | null; role_type: AccountType };
type Permission = { id: string; code: string; module: string; description: string };
type PermissionOverride = { permissions?: { code?: string; module?: string; description?: string } | { code?: string; module?: string; description?: string }[] | null; is_allowed?: boolean };
type UserRecord = {
  id: string;
  email?: string | null;
  phone?: string | null;
  confirmedAt?: string | null;
  lastSignInAt?: string | null;
  profile?: { id: string; full_name?: string | null; job_title?: string | null; phone_e164?: string | null; is_active?: boolean; account_type?: AccountType; created_at?: string } | null;
  role?: { code?: string; name?: string; role_type?: AccountType } | null;
  permissionOverrides?: PermissionOverride[];
};

type Props = { roles: Role[]; permissions: Permission[]; rolePermissions: Record<string, string[]> };

const moduleLabels: Record<string, string> = {
  administration: "Administration",
  commercial: "Commercial",
  crm: "CRM",
  customer_portal: "Customer portal",
  cms: "Content",
  finance: "Finance",
  hr: "People & HR",
  strategy: "Strategy & KPIs",
  work: "Work delivery",
};

function getRoleCode(user: UserRecord) { return user.role?.code ?? ""; }
function getOverrideCode(item: PermissionOverride) {
  const relation = item.permissions;
  return Array.isArray(relation) ? relation[0]?.code ?? "" : relation?.code ?? "";
}

export function UserManagementPanel({ roles, permissions, rolePermissions }: Props) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [accountType, setAccountType] = useState<AccountType>("staff");
  const initialStaffRole = roles.find((role) => role.role_type === "staff")?.code ?? "";
  const initialPermissionDefaults = Object.fromEntries(permissions.map((permission) => [permission.code, (rolePermissions[initialStaffRole] ?? []).includes(permission.code)]));
  const [roleCode, setRoleCode] = useState(initialStaffRole);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [address, setAddress] = useState("");
  const [accessLevel, setAccessLevel] = useState("customer_admin");
  const [createEmployee, setCreateEmployee] = useState(false);
  const [hireDate, setHireDate] = useState("");
  const [permissionOverrides, setPermissionOverrides] = useState<Record<string, boolean>>(initialPermissionDefaults);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);

  const filteredRoles = useMemo(() => roles.filter((role) => role.role_type === accountType), [roles, accountType]);
  const groupedPermissions = useMemo(() => permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    (groups[permission.module] ??= []).push(permission);
    return groups;
  }, {}), [permissions]);

  async function loadUsers() {
    setLoading(true);
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setNotice({ tone: "danger", text: result.error || "Could not load accounts." });
    else setUsers(result.users ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/users", { cache: "no-store" }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) setNotice({ tone: "danger", text: result.error || "Could not load accounts." });
      else setUsers(result.users ?? []);
      setLoading(false);
    }).catch(() => { if (!cancelled) { setNotice({ tone: "danger", text: "Could not load accounts." }); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  function applyRoleDefaults(nextRole: string) {
    const defaults = new Set(rolePermissions[nextRole] ?? []);
    setPermissionOverrides(Object.fromEntries(permissions.map((permission) => [permission.code, defaults.has(permission.code)])));
  }

  function resetForm() {
    setEditingId(null); setAccountType("staff"); setRoleCode(initialStaffRole); setFullName(""); setEmail(""); setPhone(""); setJobTitle(""); setPassword(""); setCompanyName(""); setLegalName(""); setAddress(""); setAccessLevel("customer_admin"); setCreateEmployee(false); setHireDate(""); setIsActive(true); applyRoleDefaults(initialStaffRole);
  }

  function editUser(user: UserRecord) {
    const type = user.profile?.account_type ?? (user.role?.role_type === "customer" ? "customer" : "staff");
    const nextRole = getRoleCode(user) || roles.find((role) => role.role_type === type)?.code || "";
    const nextOverrides = Object.fromEntries(permissions.map((permission) => [permission.code, rolePermissions[nextRole]?.includes(permission.code) ?? false]));
    for (const override of user.permissionOverrides ?? []) nextOverrides[getOverrideCode(override)] = Boolean(override.is_allowed);
    setEditingId(user.id); setAccountType(type); setRoleCode(nextRole); setFullName(user.profile?.full_name ?? ""); setEmail(user.email ?? ""); setPhone(user.profile?.phone_e164 ?? user.phone ?? ""); setJobTitle(user.profile?.job_title ?? ""); setPassword(""); setPermissionOverrides(nextOverrides); setIsActive(user.profile?.is_active !== false); setNotice({ tone: "info", text: `Editing ${user.email || user.id}` }); setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice(null);
    const payload = { targetUserId: editingId, accountType, roleCode, fullName, email, phone, jobTitle, password, companyName, legalName, address, accessLevel, isActive, employee: accountType === "staff" && createEmployee ? { hireDate } : undefined, permissionOverrides: permissions.map((permission) => ({ code: permission.code, isAllowed: permissionOverrides[permission.code] === true })) };
    const response = await fetch("/api/admin/users", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setNotice({ tone: "danger", text: result.error || "The account could not be saved." });
    else {
      if (result.credentials) setNotice({ tone: "success", text: `Account created. Give these credentials to ${result.user?.fullName || "the user"}: ${result.credentials.email} / ${result.credentials.password}. The Supabase UUID is ${result.user?.id}.` });
      else setNotice({ tone: "success", text: "Account updated successfully." });
      resetForm(); setFormOpen(false); await loadUsers();
    }
    setSaving(false);
  }

  async function deleteUser(user: UserRecord) {
    if (!window.confirm(`Delete ${user.email || user.id}? This disables the profile, revokes portal access, and removes the Auth identity.`)) return;
    setNotice(null);
    const response = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUserId: user.id }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setNotice({ tone: "danger", text: result.error || "The account could not be deleted." });
    else { setNotice({ tone: "success", text: "Account deleted and access revoked." }); await loadUsers(); }
  }

  const noticeClass = notice?.tone === "danger" ? "border-rose-200 bg-rose-50 text-rose-800" : notice?.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800";
  const staffCount = users.filter((user) => user.profile?.account_type !== "customer").length;
  const customerCount = users.filter((user) => user.profile?.account_type === "customer").length;
  const demoCount = users.filter((user) => (user.email ?? "").toLowerCase().startsWith("demo.")).length;

  const accountForm = <Card className="border-0 p-0 shadow-none">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">{editingId ? "Update account" : "New account"}</p><h2 className="mt-2 text-xl font-semibold text-[var(--betanor-navy)]">{editingId ? "Edit user access" : "Create a staff or customer account"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Supabase creates the Auth UUID automatically. The password is shown once after creation, and every change is audited.</p></div></div>
      <form onSubmit={submit} className="mt-6 grid gap-5 lg:grid-cols-2">
        <div><FieldLabel htmlFor="account-type">Account type</FieldLabel><select id="account-type" value={accountType} onChange={(event) => { const next = event.target.value as AccountType; setAccountType(next); const first = roles.find((role) => role.role_type === next)?.code ?? ""; setRoleCode(first); applyRoleDefaults(first); }} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="staff">Staff</option><option value="customer">Customer</option></select><FieldHint>Staff can enter the internal workspace. Customers can enter only the customer portal.</FieldHint></div>
        <div><FieldLabel htmlFor="account-role">Role</FieldLabel><select id="account-role" required value={roleCode} onChange={(event) => { setRoleCode(event.target.value); applyRoleDefaults(event.target.value); }} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="">Select a role</option>{filteredRoles.map((role) => <option key={role.id} value={role.code}>{role.name}</option>)}</select></div>
        <div><FieldLabel htmlFor="user-name">Full name</FieldLabel><Input id="user-name" required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Abebe Kebede" /></div>
        <div><FieldLabel htmlFor="user-email">Email address</FieldLabel><Input id="user-email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@betanor.et" /></div>
        <div><FieldLabel htmlFor="user-phone">Phone</FieldLabel><Input id="user-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+251 9…" /></div>
        <div><FieldLabel htmlFor="user-job">Job title</FieldLabel><Input id="user-job" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Role or position" /></div>
        <div><FieldLabel htmlFor="user-password">{editingId ? "New password (optional)" : "Temporary password"}</FieldLabel><div className="flex gap-2"><Input id="user-password" required={!editingId} minLength={10} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 10 characters"/><Button type="button" variant="outline" size="sm" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</Button></div><FieldHint>Use at least 10 characters with letters and numbers.</FieldHint></div>
        {accountType === "customer" ? <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 lg:col-span-2"><p className="text-sm font-semibold text-[var(--betanor-navy)]">Customer portal record</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><FieldLabel htmlFor="company-name">Company or customer name</FieldLabel><Input id="company-name" required value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Customer organization" /></div><div><FieldLabel htmlFor="legal-name">Legal name (optional)</FieldLabel><Input id="legal-name" value={legalName} onChange={(event) => setLegalName(event.target.value)} /></div><div><FieldLabel htmlFor="customer-address">Address</FieldLabel><Input id="customer-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Addis Ababa, Ethiopia" /></div><div><FieldLabel htmlFor="access-level">Portal access</FieldLabel><select id="access-level" value={accessLevel} onChange={(event) => setAccessLevel(event.target.value)} className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="customer_admin">Customer admin</option><option value="customer_viewer">Customer viewer</option></select></div></div></div> : <div className="rounded-xl border border-[var(--betanor-border)] bg-slate-50 p-4 lg:col-span-2"><label className="flex items-center gap-3 text-sm font-semibold text-[var(--betanor-navy)]"><input type="checkbox" checked={createEmployee} onChange={(event) => setCreateEmployee(event.target.checked)} /> Create employee profile now (8 hours/day, Monday–Friday)</label>{createEmployee ? <div className="mt-4 max-w-sm"><FieldLabel htmlFor="hire-date">Start date</FieldLabel><Input id="hire-date" required type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} /></div> : <FieldHint>You can also complete department, position, manager, and employment contract details from the Employees module.</FieldHint>}</div>}
        {editingId ? <label className="flex items-center gap-3 text-sm font-semibold text-[var(--betanor-navy)]"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Active account</label> : <div />}
        <div className="flex flex-wrap items-center gap-3 lg:col-span-2"><Button type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Update account" : "Create account"}</Button><Button type="button" variant="outline" onClick={() => { resetForm(); setFormOpen(false); }}>{editingId ? "Cancel" : "Clear"}</Button></div>
      </form>
    </Card>;

  return <div className="mt-8 space-y-8">
    {notice ? <div role="status" className={`rounded-xl border px-4 py-3 text-sm leading-6 ${noticeClass}`}>{notice.text}</div> : null}
    <div className="flex justify-end"><Button onClick={() => { resetForm(); setFormOpen(true); }}>New account</Button></div>
    {formOpen ? <Modal title={editingId ? "Update account" : "Create account"} onClose={() => { resetForm(); setFormOpen(false); }}>{accountForm}</Modal> : null}
    <Card className="p-5 sm:p-6"><button type="button" aria-expanded={capabilitiesOpen} onClick={() => setCapabilitiesOpen((open) => !open)} className="flex w-full items-center justify-between gap-4 text-left"><span><span className="block text-xs font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Capability controls</span><span className="mt-2 block text-xl font-semibold text-[var(--betanor-navy)]">Permission overrides</span></span><span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--betanor-border)] text-lg text-[var(--betanor-navy)]">{capabilitiesOpen ? "−" : "+"}</span></button>{capabilitiesOpen ? <><p className="mt-3 text-xs text-[var(--betanor-muted)]">Blue = allowed · grey = off. Role defaults are loaded first.</p><div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{Object.entries(groupedPermissions).map(([module, modulePermissions]) => <div key={module} className="rounded-xl border border-[var(--betanor-border)] p-4"><h3 className="text-sm font-semibold text-[var(--betanor-navy)]">{moduleLabels[module] || module}</h3><div className="mt-3 space-y-2">{modulePermissions.map((permission) => <label key={permission.code} className={`flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-xs transition-colors ${permissionOverrides[permission.code] ? "bg-blue-50 text-[var(--betanor-blue)]" : "text-[var(--betanor-muted)] hover:bg-slate-50"}`}><input type="checkbox" checked={permissionOverrides[permission.code] === true} onChange={(event) => setPermissionOverrides((current) => ({ ...current, [permission.code]: event.target.checked }))} className="mt-0.5"/><span><span className="block font-semibold">{permission.code}</span><span className="mt-0.5 block leading-5">{permission.description}</span></span></label>)}</div></div>)}</div></> : <p className="mt-3 text-sm text-[var(--betanor-muted)]">Expand to review or override capabilities for the next account you save.</p>}</Card>
    <Card className="overflow-hidden"><div className="border-b border-[var(--betanor-border)] px-5 py-4"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><h2 className="font-semibold text-[var(--betanor-navy)]">All accounts</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">{users.length} total identities · {staffCount} staff · {customerCount} customers · {demoCount} demo accounts included.</p></div><Button variant="outline" size="sm" onClick={() => void loadUsers()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button></div></div><div className="divide-y divide-[var(--betanor-border)]">{loading ? <p className="px-5 py-8 text-sm text-[var(--betanor-muted)]">Loading accounts…</p> : users.length ? users.map((user) => { const customer = user.profile?.account_type === "customer"; return <div key={user.id} className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{user.profile?.full_name || user.email || "Unnamed account"}</p><Badge tone={customer ? "info" : "neutral"}>{customer ? "Customer" : "Staff"}</Badge><Badge tone={user.profile?.is_active === false ? "neutral" : "success"}>{user.profile?.is_active === false ? "Inactive" : "Active"}</Badge></div><p className="mt-1 truncate text-xs text-[var(--betanor-muted)]">{user.email || "No email"} · {user.role?.name || "No role"}</p><p className="mt-1 break-all text-[11px] text-[var(--betanor-muted)]">Auth UUID: {user.id}</p></div><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-[var(--betanor-muted)]">{user.confirmedAt ? "Email confirmed" : "Confirmation pending"}</span><Button variant="outline" size="sm" onClick={() => editUser(user)}>Edit</Button><Button variant="danger" size="sm" onClick={() => void deleteUser(user)}>Delete</Button></div></div>; }) : <p className="px-5 py-8 text-sm text-[var(--betanor-muted)]">No accounts found.</p>}</div></Card>
  </div>;
}
