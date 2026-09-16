import { redirect } from "next/navigation";

import { CustomerOnboardingForm } from "@/components/auth/customer-onboarding-form";
import { BetanorMark } from "@/components/brand/betanor-mark";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function CustomerOnboardPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  if (!userId) redirect("/login?next=/customer/onboard");

  const [{ data: profile }, { data: roleRows }, { data: portalAccess }] = await Promise.all([
    supabase.from("profiles").select("account_type,is_active").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("roles(role_type)").eq("user_id", userId),
    supabase.from("customer_portal_access").select("customer_id").eq("profile_id", userId).eq("is_active", true).limit(1).maybeSingle(),
  ]);

  if (profile?.is_active === false) redirect("/login?error=This%20account%20is%20inactive");
  const hasStaffRole = (roleRows ?? []).some((row) => {
    const relation = row.roles as unknown as { role_type?: string } | { role_type?: string }[] | null;
    const role = Array.isArray(relation) ? relation[0] : relation;
    return role?.role_type === "staff";
  });
  if (hasStaffRole) redirect("/workspace");
  if (portalAccess?.customer_id) redirect("/portal");

  return <main className="grid min-h-screen place-items-center bg-[var(--betanor-surface)] px-5 py-10"><Card className="w-full max-w-xl p-7 sm:p-9"><BetanorMark /><p className="mt-10 text-xs font-bold tracking-[0.16em] text-[var(--betanor-blue)] uppercase">Complete your profile</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Tell us about your organization</h1><p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">Your verified email is the customer account identifier. Add the organization details that Betanor should associate with it.</p><CustomerOnboardingForm /></Card></main>;
}
