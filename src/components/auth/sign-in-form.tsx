"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export function SignInForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <Input id="email" name="email" type="email" autoComplete="email" required className="mt-2" />
      </label>
      <label className="block text-sm font-semibold text-[var(--betanor-navy)]" htmlFor="password">
        Password
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="mt-2" />
      </label>
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in securely"}
      </Button>
      <p className="text-center text-sm leading-6 text-[var(--betanor-muted)]">
        Access is provisioned by a Betanor administrator. Contact your manager if you need an account or password reset.
      </p>
    </form>
  );
}
