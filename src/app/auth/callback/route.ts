import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

function safeNextPath(next: string | null) {
  return next?.startsWith("/workspace") ? next : "/workspace";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  }

  const failureUrl = new URL("/login", requestUrl.origin);
  failureUrl.searchParams.set("error", "Unable to confirm that sign-in link. Please try again.");
  return NextResponse.redirect(failureUrl);
}
