export function safeAuthNextPath(value: string | undefined) {
  return value?.startsWith("/workspace") || value?.startsWith("/portal") || value?.startsWith("/customer/onboard") || value?.startsWith("/rfq") ? value : "/portal";
}

export function destinationForAccount(accountType: string | null | undefined, requestedPath: string, hasStaffRole = false) {
  if (hasStaffRole) return requestedPath.startsWith("/workspace") ? requestedPath : "/workspace";
  const isCustomer = accountType === "customer";
  if (isCustomer) return requestedPath.startsWith("/portal") || requestedPath.startsWith("/customer/onboard") || requestedPath.startsWith("/rfq") ? requestedPath : "/portal";
  return requestedPath.startsWith("/workspace") ? requestedPath : "/workspace";
}
