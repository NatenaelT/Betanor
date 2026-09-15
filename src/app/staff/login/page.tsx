import type { Metadata } from "next";
import Link from "next/link";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { Card } from "@/components/ui/card";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Staff access", robots: { index: false, follow: false } };

function safeNextPath(next: string | undefined) {
  return next?.startsWith("/workspace") ? next : "/workspace";
}

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <main className="grid min-h-screen place-items-center bg-[var(--betanor-surface)] px-5 py-10"><Card className="w-full max-w-md p-7 sm:p-9"><Link href="/" aria-label="Return to Betanor home" className="inline-flex"><BetanorMark /></Link><p className="mt-10 text-xs font-bold tracking-[0.16em] text-[var(--betanor-blue)] uppercase">Private staff access</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Betanor workspace</h1><p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">This unlisted route is protected by Supabase Auth, role permissions, and database RLS. Staff credentials are never shown on the customer website.</p><SignInForm nextPath={safeNextPath(next)} demoAccounts={[]} /></Card></main>;
}
