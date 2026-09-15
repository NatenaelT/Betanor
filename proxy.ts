import { NextResponse, type NextRequest } from "next/server";

import { refreshAuthSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, hasAuthenticatedUser } = await refreshAuthSession(request);

  if (!hasAuthenticatedUser && request.nextUrl.pathname.startsWith("/workspace")) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    const redirectResponse = NextResponse.redirect(redirectUrl);

    response.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie),
    );

    return redirectResponse;
  }

  return response;
}

export const config = {
  // Refresh Supabase cookies on every application route so moving between the
  // public website, customer portal, and staff workspace never drops a valid
  // session. Static assets are excluded to avoid needless auth work.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
