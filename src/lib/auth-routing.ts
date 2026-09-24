const AUTH_REDIRECT_PATHS = [
  "/workspace",
  "/portal",
  "/customer/onboard",
  "/rfq",
  "/account/change-password",
] as const;

export function getAuthSiteUrl(currentOrigin: string) {
  try {
    const hostname = new URL(currentOrigin).hostname.toLowerCase();
    if (hostname === "betanor.et" || hostname === "www.betanor.et" || hostname.endsWith(".vercel.app")) {
      return "https://betanor.et";
    }
  } catch {
    return currentOrigin;
  }
  return currentOrigin;
}

export function safeAuthNextPath(value: string | undefined, fallback = "/portal") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://betanor.et");
    if (url.origin !== "https://betanor.et") return fallback;
    const isAllowed = AUTH_REDIRECT_PATHS.some((prefix) =>
      url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
    );
    return isAllowed ? `${url.pathname}${url.search}` : fallback;
  } catch {
    return fallback;
  }
}

export function destinationForAccount(accountType: string | null | undefined, requestedPath: string, hasStaffRole = false) {
  if (hasStaffRole) return requestedPath === "/workspace" || requestedPath.startsWith("/workspace/") ? requestedPath : "/workspace";
  const isCustomer = accountType === "customer";
  if (isCustomer) return requestedPath === "/portal" || requestedPath.startsWith("/portal/") || requestedPath === "/customer/onboard" || requestedPath.startsWith("/customer/onboard/") || requestedPath === "/rfq" || requestedPath.startsWith("/rfq/") ? requestedPath : "/portal";
  return requestedPath === "/workspace" || requestedPath.startsWith("/workspace/") ? requestedPath : "/workspace";
}
