"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { destinationForAccount } from "@/lib/auth-routing";
import { createClient } from "@/lib/supabase/client";

type EmailLinkType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

export function ConfirmEmailForm({ tokenHash, type, nextPath }: { tokenHash: string; type: EmailLinkType; nextPath: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (verifyError) {
        setError("This link has expired or has already been used. Return to sign in to request a fresh confirmation, or request a new password-reset email.");
        return;
      }

      const { data: identity } = await supabase.auth.getUser();
      const userId = identity.user?.id;
      if (!userId) {
        setError("Your email was confirmed, but we couldn't open your Betanor session. Please sign in to continue.");
        return;
      }
      const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
        supabase.from("profiles").select("account_type,is_active,password_change_required").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("roles(role_type)").eq("user_id", userId),
      ]);
      if (profileError || rolesError || !profile) {
        setError("Your email is confirmed, but your Betanor access profile could not be loaded. Please contact an administrator.");
        return;
      }
      if (!profile.is_active) {
        await supabase.auth.signOut();
        setError("Your email is confirmed, but this account is inactive. Ask a Betanor administrator to restore access.");
        return;
      }
      const hasStaffRole = (roles ?? []).some((row) => {
        const relation = row.roles as { role_type?: string } | { role_type?: string }[] | null;
        const role = Array.isArray(relation) ? relation[0] : relation;
        return role?.role_type === "staff";
      });
      const preferredPath = type === "invite" ? "/workspace" : nextPath;
      const accountHome = destinationForAccount(profile.account_type, preferredPath, hasStaffRole);
      if (type === "recovery" || type === "invite" || profile.password_change_required) {
        router.replace(`/account/change-password?next=${encodeURIComponent(accountHome)}`);
      } else {
        router.replace(accountHome);
      }
      router.refresh();
    } catch {
      setError("We couldn't contact the authentication service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-8 space-y-5">
    {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-3 text-sm leading-6 text-red-700">{error}</p> : <p className="rounded-lg bg-blue-50 px-3 py-3 text-sm leading-6 text-blue-950">For your security, this page waits for your confirmation before using the email link. Email security scanners can open links automatically; this extra step keeps them from consuming your one-time link.</p>}
    <Button type="button" className="w-full" onClick={confirm} disabled={busy || !tokenHash}>{busy ? "Confirming securely…" : type === "recovery" ? "Continue to reset password" : "Confirm email and continue"}</Button>
    <p className="text-center text-sm text-[var(--betanor-muted)]"><Link href="/login" className="font-semibold text-[var(--betanor-blue)] hover:underline">Back to sign in</Link></p>
  </div>;
}
