import { redirect } from "next/navigation";

import { EmbeddedMailbox } from "@/components/emails/embedded-mailbox";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export default async function MailboxPage() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.hasStaffRole || !access.permissions.has("email.read") && !access.permissions.has("email.manage")) redirect("/workspace");
  return <main className="mx-auto max-w-[1600px] px-3 py-5 sm:px-5 lg:px-8 lg:py-8">
    <EmbeddedMailbox canManageSettings={access.permissions.has("email.manage")} canReadMailbox={access.permissions.has("email.read")} />
  </main>;
}
