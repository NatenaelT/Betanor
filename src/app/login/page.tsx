import Link from "next/link";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { Card } from "@/components/ui/card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(next: string | undefined) {
  return next?.startsWith("/workspace") ? next : "/workspace";
}

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : undefined);
  const supabase = await createClient();
  const { data: demoAccounts } = await supabase.rpc("get_demo_accounts");

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--betanor-surface)] px-5 py-10">
      <Card className="w-full max-w-md p-7 sm:p-9">
        <Link href="/" aria-label="Return to Betanor home" className="inline-flex">
          <BetanorMark />
        </Link>
        <p className="mt-10 text-xs font-bold tracking-[0.16em] text-[var(--betanor-blue)] uppercase">Staff workspace</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Welcome back</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">Sign in to access your authorized Betanor workspace.</p>
        <SignInForm nextPath={nextPath} demoAccounts={demoAccounts ?? []} />
      </Card>
    </main>
  );
}
