import type { Metadata } from "next";
import Link from "next/link";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { BetanorMark } from "@/components/brand/betanor-mark";
import { Card } from "@/components/ui/card";
import { safeAuthNextPath } from "@/lib/auth-routing";

export const metadata: Metadata = { title: "Set your password", robots: { index: false, follow: false } };

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextPath = safeAuthNextPath(next);
  return <main className="grid min-h-screen place-items-center bg-[var(--betanor-surface)] px-5 py-10"><Card className="w-full max-w-md p-7 sm:p-9"><Link href="/" aria-label="Return to Betanor home" className="inline-flex"><BetanorMark /></Link><p className="mt-10 text-xs font-bold tracking-[0.16em] text-[var(--betanor-blue)] uppercase">Account security</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Choose a new password</h1><p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">Set a new password after a reset, invitation or temporary-password sign-in. Use at least 8 characters.</p><ChangePasswordForm nextPath={nextPath} /></Card></main>;
}
