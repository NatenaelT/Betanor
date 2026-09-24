"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { destinationForAccount, getAuthSiteUrl } from "@/lib/auth-routing";

type DemoAccount = { email: string; label: string; role_code: string; demo_password: string };

function authHashSnapshot() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const errorCode = params.get("error_code") ?? params.get("error");
  if (!errorCode) return "";
  return `${errorCode}\u0000${params.get("error_description") ?? ""}`;
}

function subscribeAuthHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("email not confirmed") || normalized.includes("email_not_confirmed")) {
    return "This email address still needs confirmation. Use the newest confirmation email, or request a fresh link below.";
  }
  if (normalized.includes("invalid login credentials")) {
    return "The email or password is incorrect. Check your details and try again.";
  }
  if (normalized.includes("too many requests") || normalized.includes("rate limit")) {
    return "There have been too many attempts. Wait a few minutes before trying again.";
  }
  return "We couldn't sign you in right now. Check your details and connection, then try again.";
}

export function SignInForm({ nextPath, demoAccounts, initialError }: { nextPath: string; demoAccounts: DemoAccount[]; initialError?: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [status, setStatus] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resending, setResending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const authHash = useSyncExternalStore(subscribeAuthHash, authHashSnapshot, () => "");
  const [hashCode = "", hashDescription = ""] = authHash.split("\u0000");
  const hashExpired = hashDescription.toLowerCase().includes("expired");
  const hashError = authHash
    ? hashExpired
      ? "That email link has expired or was already used. Request a fresh link and use the newest email."
      : "That email link could not be completed. Request a fresh link and try again."
    : null;
  const showResend = needsConfirmation || Boolean(authHash && (hashCode.includes("otp") || hashExpired || hashDescription.toLowerCase().includes("confirmation")));

  useEffect(() => {
    if (authHash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, [authHash]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setNeedsConfirmation(false);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const supabase = createClient();
    const loginEmail = String(formData.get("email") ?? "").trim().toLowerCase();
    setEmail(loginEmail);
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: String(formData.get("password") ?? ""),
      });

      if (signInError) {
        const isUnconfirmed = signInError.code === "email_not_confirmed" || signInError.message.toLowerCase().includes("email not confirmed");
        setNeedsConfirmation(isUnconfirmed);
        setError(authErrorMessage(signInError.message));
        return;
      }

      const userId = signInData.user?.id;
      if (!userId) {
        setError("We couldn't load your account. Please try again or contact Betanor support.");
        return;
      }
      const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
        supabase.from("profiles").select("account_type,is_active,password_change_required").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("roles(role_type)").eq("user_id", userId),
      ]);
      if (profileError || rolesError || !profile) {
        setError("Your account is signed in, but its Betanor access profile could not be loaded. Please contact an administrator.");
        return;
      }
      if (profile.is_active === false) {
        await supabase.auth.signOut();
        setError("This account is inactive. Ask a Betanor administrator to restore access.");
        return;
      }
      const hasRoleType = (roleType: "customer" | "staff") => (roleRows ?? []).some((row) => {
        const relation = row.roles as unknown as { role_type?: string } | { role_type?: string }[] | null;
        const role = Array.isArray(relation) ? relation[0] : relation;
        return role?.role_type === roleType;
      });
      const hasStaffRole = hasRoleType("staff");
      const hasCustomerRole = hasRoleType("customer");
      const accountType = profile.account_type || (hasCustomerRole ? "customer" : "staff");
      const destination = destinationForAccount(accountType, nextPath, hasStaffRole);
      if (profile.password_change_required) {
        router.replace(`/account/change-password?next=${encodeURIComponent(destination)}`);
      } else {
        router.replace(destination);
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the sign-in service. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendConfirmation() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email address you used to register first.");
      return;
    }
    setResending(true);
    setError(null);
    setStatus(null);
    try {
      const supabase = createClient();
      const emailRedirectTo = new URL(`/auth/callback?next=${encodeURIComponent("/customer/onboard")}`, getAuthSiteUrl(window.location.origin)).toString();
      const { error: resendError } = await supabase.auth.resend({ type: "signup", email: normalizedEmail, options: { emailRedirectTo } });
      if (resendError) {
        setError("We couldn't resend a customer confirmation link. If this is a staff account, ask an administrator to resend the invitation.");
      } else {
        setNeedsConfirmation(false);
        setStatus("If this address has a pending customer registration, a fresh confirmation email is on its way. Use the newest message only.");
      }
    } catch {
      setError("We couldn't reach the email service. Please wait a moment and try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="email">
        Email address
        <Input id="email" name="email" type="email" autoComplete="email" required className="mt-2" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="password">
        Password
        <div className="relative mt-2"><Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="pr-16" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="absolute inset-y-0 right-0 rounded-r-lg px-3 text-xs font-semibold text-[var(--betanor-blue)] hover:bg-blue-50" onClick={() => setShowPassword((visible) => !visible)} aria-controls="password" aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button></div>
      </label>
      {error || hashError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{hashError ?? error}</p> : null}
      {status ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-900">{status}</p> : null}
      <div className="-mt-2 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={`/forgot-password?email=${encodeURIComponent(email)}`} className="font-semibold text-[var(--betanor-blue)] hover:underline">Forgot password?</Link>
        {showResend ? <button type="button" className="font-semibold text-[var(--betanor-blue)] hover:underline disabled:opacity-60" onClick={resendConfirmation} disabled={resending}>{resending ? "Sending…" : "Resend confirmation email"}</button> : null}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in securely"}
      </Button>
      {demoAccounts.length > 0 ? <section className="rounded-xl border border-dashed border-[var(--betanor-border)] bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-[var(--betanor-navy)]">Demo access</h2><p className="mt-1 text-xs leading-5 text-[var(--betanor-muted)]">Select a role to fill the demo credentials. These accounts are for testing only.</p></div><span className="rounded-full bg-[var(--betanor-light-gold)] px-2 py-1 text-[10px] font-bold tracking-wide text-[var(--betanor-dark-navy)] uppercase">Demo</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{demoAccounts.map((account) => <button key={account.email} type="button" className="rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-left text-xs font-semibold text-[var(--betanor-navy)] transition-colors hover:border-[var(--betanor-blue)] hover:bg-blue-50" onClick={() => { setEmail(account.email); setPassword(account.demo_password); setError(null); }}><span className="block">{account.label}</span><span className="mt-1 block font-normal text-[var(--betanor-muted)]">{account.email}</span></button>)}</div></section> : null}
      <p className="text-center text-sm leading-6 text-[var(--betanor-muted)]">
        Access is provisioned by a Betanor administrator. Contact your manager if you need an account or password reset.
      </p>
    </form>
  );
}
