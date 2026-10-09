import { PublicHeaderClient } from "@/components/navigation/public-header-client";
import { loadCachedNavigationSettings } from "@/lib/public-cache";
import { sortCustomerLinks } from "@/lib/navigation-settings";

export async function PublicHeader() {
  const settings = await loadCachedNavigationSettings();
  const links = sortCustomerLinks(settings.customer, "public").map(({ id, label, href }) => ({ id, label, href }));
  return <PublicHeaderClient links={links} />;
}
