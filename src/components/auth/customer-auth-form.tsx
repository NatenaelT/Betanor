"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

function toE164(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("0")) return `+251${compact.slice(1)}`;
  if (compact.startsWith("251")) return `+${compact}`;
  return `+251${compact}`;
}

export function CustomerAuthForm({ nextPath = "/portal", signUp = false }: { nextPath?: string; signUp?: boolean }) {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(signUp);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true); setError(null); setMessage(null);
    const form = new FormData(event.currentTarget);
    const phone = toE164(String(form.get("phone") ?? ""));
    const password = String(form.get("password") ?? "");
    const supabase = createClient();
    if (isSignUp) {
      const { data, error: signUpError } = await supabase.auth.signUp({ phone, password, options: { data: { full_name: String(form.get("fullName") ?? "").trim() } } });
      if (signUpError) { setError(signUpError.message); setIsSubmitting(false); return; }
      if (data.session) router.replace("/customer/onboard");
      else {
        setPendingPhone(phone);
        setMessage("We sent a verification code to your phone. Enter it below to activate your account.");
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ phone, password });
      if (signInError) { setError(signInError.message); setIsSubmitting(false); return; }
      router.replace(nextPath); router.refresh();
    }
    setIsSubmitting(false);
  }

  async function verifyPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingPhone) return;
    setIsSubmitting(true); setError(null); setMessage(null);
    const { data, error: verificationError } = await createClient().auth.verifyOtp({ phone: pendingPhone, token: verificationCode.trim(), type: "sms" });
    if (verificationError) {
      setError(verificationError.message);
      setIsSubmitting(false);
      return;
    }
    if (!data.session) {
      setError("The code was accepted, but no session was created. Please sign in with your mobile number and password.");
      setIsSubmitting(false);
      return;
    }
    router.replace("/customer/onboard");
    router.refresh();
    setIsSubmitting(false);
  }

  return <div className="mt-8 space-y-5">
    {pendingPhone ? <form className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4" onSubmit={verifyPhone}><div><p className="text-sm font-semibold text-[var(--betanor-navy)]">Verify your mobile number</p><p className="mt-1 text-xs leading-5 text-[var(--betanor-muted)]">Enter the six-digit code sent to {pendingPhone}.</p></div><Input aria-label="Verification code" inputMode="numeric" maxLength={6} minLength={6} name="verificationCode" pattern="[0-9]{6}" required value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} placeholder="6-digit code" /><Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Verifying…" : "Verify mobile number"}</Button><button type="button" className="text-sm font-semibold text-[var(--betanor-blue)]" onClick={() => { setPendingPhone(null); setVerificationCode(""); setMessage(null); setError(null); }}>Use a different number</button></form> : null}
    <form className="space-y-5" onSubmit={submit}>
    {isSignUp ? <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="customer-full-name">Contact name<Input id="customer-full-name" name="fullName" required minLength={2} className="mt-2" /></label> : null}
    <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="customer-phone">Mobile number<Input id="customer-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="09… or +251…" required className="mt-2" /></label>
    <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="customer-password">Password<Input id="customer-password" name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} minLength={8} required className="mt-2" /></label>
    {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    {message ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-900">{message}</p> : null}
    <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : isSignUp ? "Create customer account" : "Sign in securely"}</Button>
    <div className="flex items-center justify-between gap-3 text-sm"><button type="button" className="font-semibold text-[var(--betanor-blue)]" onClick={() => { setIsSignUp(!isSignUp); setPendingPhone(null); setVerificationCode(""); setError(null); setMessage(null); }}>{isSignUp ? "Already registered? Sign in" : "New customer? Create account"}</button><Link href="/" className="text-[var(--betanor-muted)] hover:text-[var(--betanor-blue)]">Back to website</Link></div>
    </form>
  </div>;
}
