import { redirect } from "next/navigation";

import { CustomerOnboardingForm } from "@/components/auth/customer-onboarding-form";
import { BetanorMark } from "@/components/brand/betanor-mark";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function CustomerOnboardPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/customer/login");
  return <main className="grid min-h-screen place-items-center bg-[var(--betanor-surface)] px-5 py-10"><Card className="w-full max-w-xl p-7 sm:p-9"><BetanorMark /><p className="mt-10 text-xs font-bold tracking-[0.16em] text-[var(--betanor-blue)] uppercase">Complete your profile</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Tell us about your organization</h1><p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">Your mobile number is your unique customer identifier. Add the organization details that Betanor should associate with it.</p><CustomerOnboardingForm /></Card></main>;
}
