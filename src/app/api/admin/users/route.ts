import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function invoke(payload: Record<string, unknown>) {
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke("admin-user-management", { body: payload });
  if (error) {
    const status = /not authorized|permission|authentication|session/i.test(error.message) ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}

export async function GET() {
  return invoke({ action: "list" });
}

export async function POST(request: Request) {
  return invoke({ action: "create", ...(await request.json()) });
}

export async function PATCH(request: Request) {
  return invoke({ action: "update", ...(await request.json()) });
}

export async function DELETE(request: Request) {
  return invoke({ action: "delete", ...(await request.json()) });
}
