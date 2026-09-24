import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  const canManage = access.permissions.has("users.manage") || access.permissions.has("settings.manage") || access.roleCodes.has("SUPER_ADMIN");
  if (!access.userId || !access.isActive || !access.hasStaffRole || !canManage) {
    return Response.json({ error: "You are not authorized to download the programmer guide." }, { status: 403 });
  }

  const guide = await readFile(join(process.cwd(), "docs", "PROGRAMMER_GUIDE_DOWNLOAD.md"), "utf8");
  return new Response(guide, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="Betanor-Programmer-Guide.md"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
