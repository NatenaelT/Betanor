import Link from "next/link";

import { CustomerAuthForm } from "@/components/auth/customer-auth-form";
import { BetanorMark } from "@/components/brand/betanor-mark";
import { Card } from "@/components/ui/card";

export default async function CustomerRegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const nextPath = next?.startsWith("/portal") || next?.startsWith("/rfq") || next?.startsWith("/customer/onboard") ? next : "/customer/onboard";
  return <main className="grid min-h-screen place-items-center bg-[var(--betanor-surface)] px-5 py-10"><Card className="w-full max-w-md p-7 sm:p-9"><Link href="/" aria-label="Return to Betanor home" className="inline-flex"><BetanorMark /></Link><p className="mt-10 text-xs font-bold tracking-[0.16em] text-[var(--betanor-blue)] uppercase">Customer registration</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Create your Betanor account</h1><p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">Create a customer account with your email. After confirmation, the same universal sign-in will route you to your portal.</p>{error ? <p role="alert" className="mt-5 rounded-lg bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">{error}</p> : null}<CustomerAuthForm nextPath={nextPath} signUp allowToggle={false} /></Card></main>;
}
