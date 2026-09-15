import Link from "next/link";

import { CustomerAuthForm } from "@/components/auth/customer-auth-form";
import { BetanorMark } from "@/components/brand/betanor-mark";
import { Card } from "@/components/ui/card";

export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextPath = next?.startsWith("/portal") || next?.startsWith("/rfq") ? next : "/portal";
  return <main className="grid min-h-screen place-items-center bg-[var(--betanor-surface)] px-5 py-10"><Card className="w-full max-w-md p-7 sm:p-9"><Link href="/" aria-label="Return to Betanor home" className="inline-flex"><BetanorMark /></Link><p className="mt-10 text-xs font-bold tracking-[0.16em] text-[var(--betanor-blue)] uppercase">Customer portal</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Your Betanor workspace</h1><p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">Sign in with your registered mobile number to see requests, quotations, delivery, and billing.</p><CustomerAuthForm nextPath={nextPath} /></Card></main>;
}
