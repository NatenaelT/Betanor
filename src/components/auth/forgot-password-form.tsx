"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthSiteUrl } from "@/lib/auth-routing";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSent(false);
    setError(null);
    try {
      const redirectTo = new URL("/auth/callback", getAuthSiteUrl(window.location.origin));
      redirectTo.searchParams.set("next", "/account/change-password");
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: redirectTo.toString(),
      });
      if (resetError) {
        setError("We couldn't send a password-reset email right now. Wait a moment and try again, or contact Betanor support.");
        return;
      }
      // Supabase intentionally does not disclose whether an email is registered.
      setSent(true);
    } catch {
      setError("We couldn't reach the email service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="mt-8 space-y-5">
    <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="reset-email">
      Email address
      <Input id="reset-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2" />
    </label>
    {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">{error}</p> : null}
    {sent ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-900">If an account uses this email, a password-reset link is on its way. Check your inbox and spam folder, then use the newest message.</p> : null}
    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send password-reset link"}</Button>
    <p className="text-center text-sm text-[var(--betanor-muted)]"><Link href="/login" className="font-semibold text-[var(--betanor-blue)] hover:underline">Back to sign in</Link></p>
  </form>;
}
