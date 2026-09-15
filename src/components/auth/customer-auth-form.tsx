"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export function CustomerAuthForm({ nextPath = "/portal", signUp = false }: { nextPath?: string; signUp?: boolean }) {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(signUp);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true); setError(null); setMessage(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const supabase = createClient();
    if (isSignUp) {
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/customer/onboard")}`;
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: String(form.get("fullName") ?? "").trim() }, emailRedirectTo } });
      if (signUpError) { setError(signUpError.message); setIsSubmitting(false); return; }
      if (data.session) router.replace("/customer/onboard");
      else setMessage("We sent a confirmation link to your email. Confirm your address, then sign in to finish your customer profile.");
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) { setError(signInError.message); setIsSubmitting(false); return; }
      router.replace(nextPath); router.refresh();
    }
    setIsSubmitting(false);
  }

  return <form className="mt-8 space-y-5" onSubmit={submit}>
    {isSignUp ? <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="customer-full-name">Contact name<Input id="customer-full-name" name="fullName" required minLength={2} className="mt-2" /></label> : null}
    <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="customer-email">Email address<Input id="customer-email" name="email" type="email" autoComplete="email" required className="mt-2" /></label>
    <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="customer-password">Password<Input id="customer-password" name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} minLength={8} required className="mt-2" /></label>
    {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    {message ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-900">{message}</p> : null}
    <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : isSignUp ? "Create customer account" : "Sign in securely"}</Button>
    <div className="flex items-center justify-between gap-3 text-sm"><button type="button" className="font-semibold text-[var(--betanor-blue)]" onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}>{isSignUp ? "Already registered? Sign in" : "New customer? Create account"}</button><Link href="/" className="text-[var(--betanor-muted)] hover:text-[var(--betanor-blue)]">Back to website</Link></div>
  </form>;
}
