import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

function safeNextPath(next: string | null) {
  return next?.startsWith("/workspace") || next?.startsWith("/portal") || next?.startsWith("/customer/onboard") || next?.startsWith("/rfq") ? next : "/workspace";
}

function isCustomerFlow(next: string | null) {
  return Boolean(
    next?.startsWith("/customer/") ||
      next?.startsWith("/portal") ||
      next?.startsWith("/rfq"),
  );
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next");
  const nextPath = safeNextPath(requestedNext);
  const customerFlow = isCustomerFlow(requestedNext);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  }

  const failureUrl = new URL(customerFlow ? "/customer/login" : "/staff/login", requestUrl.origin);
  failureUrl.searchParams.set(
    "error",
    customerFlow
      ? "This confirmation link could not be completed in this browser. Request a fresh link and open it in the same browser where you started registration."
      : "Unable to confirm that sign-in link. Please try again.",
  );
  failureUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(failureUrl);
}
