import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json().catch(() => ({}));
  const { data, error } = await supabase.functions.invoke("admin-user-management", {
    body: { ...body, action: body.action || "provision_employee" },
  });
  if (error) {
    const status = /not authorized|permission|authentication|session/i.test(error.message) ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data, { status: body.action === "provision_employee" ? 201 : 200 });
}
