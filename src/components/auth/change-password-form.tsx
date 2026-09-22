"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export function ChangePasswordForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      setError(passwordError.message);
      setBusy(false);
      return;
    }
    const { error: profileError } = await supabase.from("profiles").update({ password_change_required: false }).eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");
    if (profileError) {
      setError("Password changed, but the activation flag could not be cleared. Please sign in again or contact an administrator.");
      setBusy(false);
      return;
    }
    router.replace(nextPath);
    router.refresh();
  }

  return <form onSubmit={submit} className="mt-8 space-y-5">
    <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="new-password">New password
      <div className="relative mt-2"><Input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="pr-16" /><button type="button" className="absolute inset-y-0 right-0 rounded-r-lg px-3 text-xs font-semibold text-[var(--betanor-blue)] hover:bg-blue-50" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button></div>
    </label>
    <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="confirm-password">Confirm new password
      <Input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2" />
    </label>
    {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Set password and continue"}</Button>
  </form>;
}
