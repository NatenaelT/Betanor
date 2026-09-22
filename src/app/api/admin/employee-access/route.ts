import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { readFunctionError } from "@/lib/supabase/function-error";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json().catch(() => ({}));
  const { data, error } = await supabase.functions.invoke("admin-user-management", {
    body: { ...body, action: body.action || "provision_employee" },
  });
  if (error) {
    const result = await readFunctionError(error);
    const status = /not authorized|permission|authentication|session/i.test(result.message) ? 403 : result.status;
    return NextResponse.json({ error: result.message }, { status });
  }
  return NextResponse.json(data, { status: body.action === "provision_employee" ? 201 : 200 });
}
