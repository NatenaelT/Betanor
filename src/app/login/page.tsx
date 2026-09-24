import type { Metadata } from "next";
import Link from "next/link";

import { SignInForm } from "@/components/auth/sign-in-form";
import { BetanorMark } from "@/components/brand/betanor-mark";
import { Card } from "@/components/ui/card";
import { safeAuthNextPath } from "@/lib/auth-routing";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const nextPath = safeAuthNextPath(next);
  return <main className="grid min-h-screen place-items-center bg-[var(--betanor-surface)] px-5 py-10"><Card className="w-full max-w-md p-7 sm:p-9"><Link href="/" aria-label="Return to Betanor home" className="inline-flex"><BetanorMark /></Link><p className="mt-10 text-xs font-bold tracking-[0.16em] text-[var(--betanor-blue)] uppercase">Betanor account</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Sign in</h1><p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">Use the email and password given by Betanor. Your assigned role automatically opens the correct staff workspace or customer portal.</p><SignInForm nextPath={nextPath} demoAccounts={[]} initialError={error} /><div className="mt-6 border-t border-[var(--betanor-border)] pt-5 text-center text-sm text-[var(--betanor-muted)]"><span>New customer? </span><Link href="/customer/register" className="font-semibold text-[var(--betanor-blue)]">Create an account</Link></div></Card></main>;
}
