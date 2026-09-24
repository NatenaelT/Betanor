import { NextResponse, type NextRequest } from "next/server";

import { destinationForAccount, safeAuthNextPath } from "@/lib/auth-routing";
import { createClient } from "@/lib/supabase/server";

function hasStaffRole(rows: Array<{ roles: unknown }> | null) {
  return (rows ?? []).some((row) => {
    const relation = row.roles as { role_type?: string } | { role_type?: string }[] | null;
    const role = Array.isArray(relation) ? relation[0] : relation;
    return role?.role_type === "staff";
  });
}

async function accountRoute(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, requestedNext: string) {
  const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
    supabase.from("profiles").select("account_type,is_active,password_change_required").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("roles(role_type)").eq("user_id", userId),
  ]);
  if (profileError || rolesError || !profile) return { error: "Your Betanor access profile could not be loaded. Please contact an administrator." };
  if (!profile.is_active) return { error: "This account is inactive. Ask a Betanor administrator to restore access." };

  const staff = hasStaffRole(roleRows);
  const passwordDestination = destinationForAccount(profile.account_type, staff ? "/workspace" : "/portal", staff);
  const next = requestedNext === "/account/change-password"
    ? `/account/change-password?next=${encodeURIComponent(passwordDestination)}`
    : profile.password_change_required
      ? `/account/change-password?next=${encodeURIComponent(destinationForAccount(profile.account_type, requestedNext, staff))}`
      : destinationForAccount(profile.account_type, requestedNext, staff);
  return { next };
}

function loginUrl(requestUrl: URL, error: string, nextPath: string) {
  const url = new URL("/login", requestUrl.origin);
  url.searchParams.set("error", error);
  url.searchParams.set("next", nextPath);
  return url;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = safeAuthNextPath(requestUrl.searchParams.get("next") ?? undefined, "/workspace");
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(loginUrl(
        requestUrl,
        "This email link has expired, was already used, or was opened in a different browser. Request a fresh confirmation or password-reset email.",
        nextPath,
      ));
    }
  }

  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  if (!userId) {
    return NextResponse.redirect(loginUrl(requestUrl, "We couldn't complete that email link. Request a fresh link and open the newest message.", nextPath));
  }

  const destination = await accountRoute(supabase, userId, nextPath);
  if (destination.error) {
    await supabase.auth.signOut();
    return NextResponse.redirect(loginUrl(requestUrl, destination.error, nextPath));
  }
  return NextResponse.redirect(new URL(destination.next!, requestUrl.origin));
}
