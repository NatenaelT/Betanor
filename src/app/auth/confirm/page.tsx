import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmEmailForm } from "@/components/auth/confirm-email-form";
import { BetanorMark } from "@/components/brand/betanor-mark";
import { Card } from "@/components/ui/card";
import { safeAuthNextPath } from "@/lib/auth-routing";

export const metadata: Metadata = { title: "Confirm your Betanor account", robots: { index: false, follow: false }, referrer: "no-referrer" };

const EMAIL_LINK_TYPES = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

function getNextPath(next: string | undefined, redirectTo: string | undefined, type: string) {
  let requestedNext = next;
  if (!requestedNext && redirectTo) {
    try {
      requestedNext = new URL(redirectTo).searchParams.get("next") ?? undefined;
    } catch {
      requestedNext = undefined;
    }
  }
  const fallback = type === "recovery" ? "/account/change-password" : type === "invite" ? "/workspace" : "/customer/onboard";
  return safeAuthNextPath(requestedNext, fallback);
}

export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; next?: string; redirect_to?: string }> }) {
  const { token_hash: tokenHash = "", type: requestedType = "", next, redirect_to: redirectTo } = await searchParams;
  const validType = EMAIL_LINK_TYPES.has(requestedType);
  const type = validType ? requestedType as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email" : "email";
  return <main className="grid min-h-screen place-items-center bg-[var(--betanor-surface)] px-5 py-10">
    <Card className="w-full max-w-md p-7 sm:p-9">
      <Link href="/" aria-label="Return to Betanor home" className="inline-flex"><BetanorMark /></Link>
      <p className="mt-10 text-xs font-bold tracking-[0.16em] text-[var(--betanor-blue)] uppercase">Secure account link</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">{type === "recovery" ? "Reset your password" : "Confirm your email"}</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">{validType && tokenHash ? "Confirm this one-time email link to continue to your Betanor account." : "This confirmation link is incomplete. Return to sign in and request a fresh email."}</p>
      <ConfirmEmailForm tokenHash={validType ? tokenHash : ""} type={type} nextPath={getNextPath(next, redirectTo, type)} />
    </Card>
  </main>;
}
