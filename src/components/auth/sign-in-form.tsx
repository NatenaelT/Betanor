"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type DemoAccount = { email: string; label: string; role_code: string; demo_password: string };

export function SignInForm({ nextPath, demoAccounts }: { nextPath: string; demoAccounts: DemoAccount[] }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="email">
        Work email
        <Input id="email" name="email" type="email" autoComplete="email" required className="mt-2" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="password">
        Password
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="mt-2" value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
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
