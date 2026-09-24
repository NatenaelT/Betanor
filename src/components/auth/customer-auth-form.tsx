"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { destinationForAccount, getAuthSiteUrl } from "@/lib/auth-routing";

export function CustomerAuthForm({ nextPath = "/portal", signUp = false, allowToggle = true }: { nextPath?: string; signUp?: boolean; allowToggle?: boolean }) {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(signUp);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [lastSignupEmail, setLastSignupEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  function getAuthOrigin() {
    return getAuthSiteUrl(window.location.origin);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true); setError(null); setMessage(null); setNeedsConfirmation(false);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    try {
      const supabase = createClient();
      if (isSignUp) {
        const emailRedirectTo = `${getAuthOrigin()}/auth/callback?next=${encodeURIComponent("/customer/onboard")}`;
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: String(form.get("fullName") ?? "").trim(), account_type: "customer" }, emailRedirectTo } });
        if (signUpError) { setError(signUpError.message.toLowerCase().includes("already registered") ? "An account already uses this email. Sign in instead or reset its password." : "We couldn't create your customer account. Check the details and try again."); return; }
        if (data.session) router.replace("/customer/onboard");
        else { setLastSignupEmail(email); setMessage("We sent a confirmation link to your email. Open the newest message to confirm your address, then sign in."); }
      } else {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          const isUnconfirmed = signInError.code === "email_not_confirmed" || signInError.message.toLowerCase().includes("email not confirmed");
          setError(isUnconfirmed ? "Confirm your email address before signing in. Use the newest confirmation link." : "We couldn't sign you in. Check the email and password, then try again.");
          setNeedsConfirmation(isUnconfirmed);
          if (isUnconfirmed) setLastSignupEmail(email);
          setIsSubmitting(false);
          return;
        }
        const userId = signInData.user?.id;
        if (!userId) { setError("We couldn't load your account. Please try again."); return; }
        const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
          supabase.from("profiles").select("account_type,is_active").eq("id", userId).maybeSingle(),
          supabase.from("user_roles").select("roles(role_type)").eq("user_id", userId),
        ]);
        if (profileError || rolesError || !profile) { setError("Your Betanor access profile could not be loaded. Please contact support."); return; }
        if (profile.is_active === false) { await supabase.auth.signOut(); setError("This account is inactive. Ask a Betanor administrator to restore access."); return; }
        const hasStaffRole = (roleRows ?? []).some((row) => {
          const relation = row.roles as unknown as { role_type?: string } | { role_type?: string }[] | null;
          const role = Array.isArray(relation) ? relation[0] : relation;
          return role?.role_type === "staff";
        });
        router.replace(destinationForAccount(profile.account_type, nextPath, hasStaffRole)); router.refresh();
      }
    } catch {
      setError("We couldn't reach the authentication service. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendConfirmation() {
    if (!lastSignupEmail) return;
    setIsResending(true); setError(null);
    try {
      const supabase = createClient();
      const emailRedirectTo = `${getAuthOrigin()}/auth/callback?next=${encodeURIComponent("/customer/onboard")}`;
      const { error: resendError } = await supabase.auth.resend({ type: "signup", email: lastSignupEmail, options: { emailRedirectTo } });
      if (resendError) setError("We couldn't resend a customer confirmation link. Please try again or contact Betanor support.");
      else { setNeedsConfirmation(false); setMessage("If this address has a pending registration, a fresh confirmation link is on its way. Use the newest email only."); }
    } catch {
      setError("We couldn't reach the email service. Please wait a moment and try again.");
    } finally {
      setIsResending(false);
    }
  }

  return <form className="mt-8 space-y-5" onSubmit={submit}>
    {isSignUp ? <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="customer-full-name">Contact name<Input id="customer-full-name" name="fullName" required minLength={2} className="mt-2" /></label> : null}
    <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="customer-email">Email address<Input id="customer-email" name="email" type="email" autoComplete="email" required className="mt-2" /></label>
    <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="customer-password">Password<div className="relative mt-2"><Input id="customer-password" name="password" type={showPassword ? "text" : "password"} autoComplete={isSignUp ? "new-password" : "current-password"} minLength={8} required className="pr-16" /><button type="button" className="absolute inset-y-0 right-0 rounded-r-lg px-3 text-xs font-semibold text-[var(--betanor-blue)] hover:bg-blue-50" onClick={() => setShowPassword((visible) => !visible)} aria-controls="customer-password" aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button></div></label>
    {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    {message ? <div role="status" className="rounded-lg bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-900"><p>{message}</p>{lastSignupEmail && !isSignUp ? null : lastSignupEmail ? <button type="button" className="mt-2 font-semibold text-[var(--betanor-blue)] disabled:opacity-60" onClick={resendConfirmation} disabled={isResending}>{isResending ? "Sending…" : "Resend confirmation email"}</button> : null}</div> : null}
    {needsConfirmation ? <button type="button" className="text-sm font-semibold text-[var(--betanor-blue)] hover:underline disabled:opacity-60" onClick={resendConfirmation} disabled={isResending}>{isResending ? "Sending…" : "Resend confirmation email"}</button> : null}
    {!isSignUp ? <p className="text-right text-sm"><Link href={`/forgot-password?email=${encodeURIComponent(lastSignupEmail ?? "")}`} className="font-semibold text-[var(--betanor-blue)] hover:underline">Forgot password?</Link></p> : null}
    <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : isSignUp ? "Create customer account" : "Sign in securely"}</Button>
    <div className="flex items-center justify-between gap-3 text-sm">{allowToggle ? <button type="button" className="font-semibold text-[var(--betanor-blue)]" onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); setLastSignupEmail(null); setNeedsConfirmation(false); }}>{isSignUp ? "Already registered? Sign in" : "New customer? Create account"}</button> : <Link href="/login" className="font-semibold text-[var(--betanor-blue)]">Already registered? Sign in</Link>}<Link href="/" className="text-[var(--betanor-muted)] hover:text-[var(--betanor-blue)]">Back to website</Link></div>
  </form>;
}
