import { NextRequest, NextResponse } from "next/server";

import { isAssignmentNotification, notificationHref } from "@/lib/noren/notifications";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

async function notificationAccess(supabase: Awaited<ReturnType<typeof createClient>>, surface: string) {
  const access = await resolveWorkspace(supabase);
  if (!access.userId || !access.isActive) return null;
  if (surface === "staff") return access.hasStaffRole ? { ...access, surface } : null;
  if (surface !== "customer") return null;
  const { data: portalAccess } = await supabase.from("customer_portal_access")
    .select("customer_id").eq("profile_id", access.userId).eq("is_active", true).limit(1).maybeSingle();
  return portalAccess?.customer_id ? { ...access, surface } : null;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const surface = request.nextUrl.searchParams.get("surface") || "staff";
  const access = await notificationAccess(supabase, surface);
  if (!access?.userId) return NextResponse.json({ error: "Notification access required." }, { status: 403 });

  const filter = request.nextUrl.searchParams.get("filter") || "all";
  if (!["all", "unread", "assigned"].includes(filter)) return NextResponse.json({ error: "Invalid filter." }, { status: 400 });
  const page = Number(request.nextUrl.searchParams.get("page") || "1");
  if (!Number.isInteger(page) || page < 1 || page > 10000) return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  const limit = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || "20") || 20));

  if (surface === "customer") {
    if (filter === "assigned") return NextResponse.json({ error: "Invalid customer filter." }, { status: 400 });
    const { data, error } = await supabase.rpc("noren_customer_notification_page", {
      page_input: page, limit_input: limit, unread_only: filter === "unread",
    });
    if (error || !data) return NextResponse.json({ error: "Notifications could not be loaded." }, { status: 500 });
    const result = data as { items: Array<{ entity_id: string }>; total: number; unreadCount: number };
    return NextResponse.json({ ...result, items: result.items.map((item) => ({ ...item, href: `/portal/support/tickets/${item.entity_id}` })), page, limit }, { headers: { "Cache-Control": "private, no-store" } });
  }

  let query = supabase.from("notifications")
    .select("id,type,title,body,entity_type,entity_id,read_at,created_at", { count: "exact" })
    .eq("recipient_id", access.userId)
    .order("created_at", { ascending: false });
  if (filter === "unread") query = query.is("read_at", null);
  if (filter === "assigned") query = query.or("entity_type.eq.task,type.eq.TASK_ASSIGNED,type.eq.TASK_DUE,type.eq.TASK_OVERDUE");
  const [{ data, count, error }, unread] = await Promise.all([
    query.range((page - 1) * limit, page * limit - 1),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", access.userId).is("read_at", null),
  ]);
  if (error || unread.error) return NextResponse.json({ error: "Notifications could not be loaded." }, { status: 500 });
  const items = (data || []).filter((item) => filter !== "assigned" || isAssignmentNotification(item)).map((item) => ({ ...item, href: notificationHref(item, access.permissions) }));
  return NextResponse.json({ items, total: count || 0, unreadCount: unread.count || 0, page, limit }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json().catch(() => null);
  const surface = body?.surface === "customer" ? "customer" : "staff";
  const access = await notificationAccess(supabase, surface);
  if (!access?.userId) return NextResponse.json({ error: "Notification access required." }, { status: 403 });
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || typeof body?.read !== "boolean") return NextResponse.json({ error: "Invalid notification update." }, { status: 400 });
  if (surface === "customer") {
    const { data: notification } = await supabase.from("notifications")
      .select("entity_id").eq("id", id).eq("recipient_id", access.userId).eq("entity_type", "support_ticket").maybeSingle();
    if (!notification?.entity_id) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    const { data: ticket } = await supabase.from("support_tickets")
      .select("id,customer_id").eq("id", notification.entity_id).maybeSingle();
    if (!ticket) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    const { data: portalAccess } = await supabase.from("customer_portal_access")
      .select("customer_id").eq("profile_id", access.userId).eq("customer_id", ticket.customer_id).eq("is_active", true).maybeSingle();
    if (!portalAccess) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  }
  let query = supabase.from("notifications")
    .update({ read_at: body.read ? new Date().toISOString() : null })
    .eq("id", id).eq("recipient_id", access.userId);
  if (surface === "customer") query = query.eq("entity_type", "support_ticket");
  const { data, error } = await query.select("id,read_at").maybeSingle();
  if (error) return NextResponse.json({ error: "Notification could not be updated." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  return NextResponse.json(data);
}
