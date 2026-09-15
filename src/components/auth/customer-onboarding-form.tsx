"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export function CustomerOnboardingForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = new FormData(event.currentTarget);
    const { error: rpcError } = await createClient().rpc("create_customer_portal_account", { company_name_input: String(form.get("companyName") ?? "").trim(), contact_name_input: String(form.get("contactName") ?? "").trim(), email_input: String(form.get("email") ?? "").trim(), address_input: String(form.get("address") ?? "").trim() || null });
    if (rpcError) { setError(rpcError.message); setSaving(false); return; }
    router.replace("/portal"); router.refresh();
  }
  return <form className="mt-8 grid gap-5 sm:grid-cols-2" onSubmit={submit}><label className="text-sm font-semibold text-[var(--betanor-navy)]">Organization name<Input name="companyName" required minLength={2} className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Contact name<Input name="contactName" required minLength={2} className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">Email for documents<Input name="email" type="email" className="mt-2" /></label><label className="text-sm font-semibold text-[var(--betanor-navy)]">City / address<Input name="address" className="mt-2" /></label>{error ? <p role="alert" className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}<Button className="sm:col-span-2" type="submit" disabled={saving}>{saving ? "Creating workspace…" : "Open customer workspace"}</Button></form>;
}
