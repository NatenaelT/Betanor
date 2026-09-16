"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { destinationForAccount } from "@/lib/auth-routing";

export function CustomerAuthForm({ nextPath = "/portal", signUp = false, allowToggle = true }: { nextPath?: string; signUp?: boolean; allowToggle?: boolean }) {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(signUp);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [lastSignupEmail, setLastSignupEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  function getAuthOrigin() {
    const hostname = window.location.hostname;
    if (hostname === "betanor.et" || hostname === "www.betanor.et" || hostname.endsWith(".vercel.app")) {
      return "https://betanor.et";
    }
    return window.location.origin;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true); setError(null); setMessage(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const supabase = createClient();
    if (isSignUp) {
      const emailRedirectTo = `${getAuthOrigin()}/auth/callback?next=${encodeURIComponent("/customer/onboard")}`;
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: String(form.get("fullName") ?? "").trim(), account_type: "customer" }, emailRedirectTo } });
      if (signUpError) { setError(signUpError.message); setIsSubmitting(false); return; }
      if (data.session) router.replace("/customer/onboard");
      else { setLastSignupEmail(email); setMessage("We sent a confirmation link to your email. Confirm your address, then sign in to finish your customer profile."); }
    } else {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) { setError(signInError.message); setIsSubmitting(false); return; }
      const userId = signInData.user?.id;
      const { data: profile } = userId ? await supabase.from("profiles").select("account_type,is_active").eq("id", userId).maybeSingle() : { data: null };
      if (profile?.is_active === false) { await supabase.auth.signOut(); setError("This account is inactive. Ask a Betanor administrator to restore access."); setIsSubmitting(false); return; }
      router.replace(destinationForAccount(profile?.account_type, nextPath)); router.refresh();
    }
    setIsSubmitting(false);
  }

  async function resendConfirmation() {
    if (!lastSignupEmail) return;
    setIsResending(true); setError(null);
    const supabase = createClient();
    const emailRedirectTo = `${getAuthOrigin()}/auth/callback?next=${encodeURIComponent("/customer/onboard")}`;
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email: lastSignupEmail, options: { emailRedirectTo } });
    if (resendError) setError(resendError.message);
    else setMessage("A fresh confirmation link has been sent. Open the newest email only; older links are invalidated.");
    setIsResending(false);
  }

  return <form className="mt-8 space-y-5" onSubmit={submit}>
    {isSignUp ? <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="customer-full-name">Contact name<Input id="customer-full-name" name="fullName" required minLength={2} className="mt-2" /></label> : null}
    <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="customer-email">Email address<Input id="customer-email" name="email" type="email" autoComplete="email" required className="mt-2" /></label>
    <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="customer-password">Password<div className="relative mt-2"><Input id="customer-password" name="password" type={showPassword ? "text" : "password"} autoComplete={isSignUp ? "new-password" : "current-password"} minLength={8} required className="pr-16" /><button type="button" className="absolute inset-y-0 right-0 rounded-r-lg px-3 text-xs font-semibold text-[var(--betanor-blue)] hover:bg-blue-50" onClick={() => setShowPassword((visible) => !visible)} aria-controls="customer-password" aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button></div></label>
    {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    {message ? <div role="status" className="rounded-lg bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-900"><p>{message}</p>{lastSignupEmail ? <button type="button" className="mt-2 font-semibold text-[var(--betanor-blue)] disabled:opacity-60" onClick={resendConfirmation} disabled={isResending}>{isResending ? "Sending…" : "Resend confirmation email"}</button> : null}</div> : null}
    <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : isSignUp ? "Create customer account" : "Sign in securely"}</Button>
    <div className="flex items-center justify-between gap-3 text-sm">{allowToggle ? <button type="button" className="font-semibold text-[var(--betanor-blue)]" onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); setLastSignupEmail(null); }}>{isSignUp ? "Already registered? Sign in" : "New customer? Create account"}</button> : <Link href="/login" className="font-semibold text-[var(--betanor-blue)]">Already registered? Sign in</Link>}<Link href="/" className="text-[var(--betanor-muted)] hover:text-[var(--betanor-blue)]">Back to website</Link></div>
  </form>;
}
