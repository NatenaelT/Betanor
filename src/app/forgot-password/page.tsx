import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { BetanorMark } from "@/components/brand/betanor-mark";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  const initialEmail = typeof email === "string" ? email.slice(0, 254) : "";
  return <main className="grid min-h-screen place-items-center bg-[var(--betanor-surface)] px-5 py-10">
    <Card className="w-full max-w-md p-7 sm:p-9">
      <Link href="/" aria-label="Return to Betanor home" className="inline-flex"><BetanorMark /></Link>
      <p className="mt-10 text-xs font-bold tracking-[0.16em] text-[var(--betanor-blue)] uppercase">Account recovery</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Reset your password</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">Enter the email address on your Betanor account. We’ll send a secure link to choose a new password.</p>
      <ForgotPasswordForm initialEmail={initialEmail} />
    </Card>
  </main>;
}
