import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

type AccountType = "staff" | "customer";
type Action = "list" | "create" | "update" | "delete";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function fail(message: string, status = 400): never {
  throw new Error(`${status}:${message}`);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const split = message.match(/^(\d+):(.*)$/s);
  return { status: split ? Number(split[1]) : 400, message: split?.[2] || message };
}

function passwordIsStrong(password: string) {
  return password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

async function firstWorkspace(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.from("workspaces").select("id").order("created_at").limit(1).maybeSingle();
  if (error || !data?.id) fail("The Betanor workspace is not configured.", 500);
  return data.id as string;
}

async function callerContext(admin: ReturnType<typeof createClient>, callerId: string) {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,workspace_id,is_active,account_type,full_name,email_address")
    .eq("id", callerId)
    .maybeSingle();
  if (profileError || !profile?.is_active || profile.account_type === "customer") {
    fail("Your account is not active for administration.", 403);
  }
  const workspaceId = (profile.workspace_id as string | null) || await firstWorkspace(admin);
  const { data: assignments } = await admin
    .from("user_roles")
    .select("roles(code,role_type)")
    .eq("user_id", callerId);
  const roles = (assignments ?? []).map((row) => {
    const relation = row.roles as unknown as { code?: string; role_type?: string } | { code?: string; role_type?: string }[] | null;
    return Array.isArray(relation) ? relation[0] : relation;
  }).filter((role): role is { code: string; role_type?: string } => Boolean(role?.code));
  const { data: override } = await admin
    .from("user_permissions")
    .select("is_allowed,permissions(code)")
    .eq("user_id", callerId);
  const usersOverride = (override ?? []).find((row) => {
    const relation = row.permissions as unknown as { code?: string } | { code?: string }[] | null;
    return (Array.isArray(relation) ? relation[0]?.code : relation?.code) === "users.manage";
  });
  const hasRolePermission = roles.some((role) => role.role_type === "staff" && ["SUPER_ADMIN", "ADMIN"].includes(role.code));
  const canManage = usersOverride ? Boolean(usersOverride.is_allowed) : hasRolePermission;
  if (!canManage) fail("You need the users.manage permission to manage accounts.", 403);
  return { workspaceId, roles };
}

async function roleFor(admin: ReturnType<typeof createClient>, roleCode: string, accountType: AccountType) {
  if (!roleCode) fail("Choose a role.");
  const { data: role, error } = await admin
    .from("roles")
    .select("id,code,name,role_type,is_system")
    .eq("code", roleCode)
    .is("workspace_id", null)
    .maybeSingle();
  if (error || !role || !role.is_system || role.role_type !== accountType) {
    fail(`The selected role is not available for ${accountType} accounts.`);
  }
  return role;
}

async function permissionRows(admin: ReturnType<typeof createClient>, overrides: unknown) {
  if (!Array.isArray(overrides)) return [] as Array<{ permission_id: string; is_allowed: boolean }>;
  const codes = [...new Set(overrides.map((item) => clean((item as { code?: unknown })?.code)).filter(Boolean))];
  if (!codes.length) return [] as Array<{ permission_id: string; is_allowed: boolean }>;
  const { data, error } = await admin.from("permissions").select("id,code").in("code", codes);
  if (error) fail("Could not read the permission catalogue.", 500);
  const ids = new Map((data ?? []).map((row) => [row.code, row.id]));
  return overrides.flatMap((item) => {
    const code = clean((item as { code?: unknown })?.code);
    const id = ids.get(code);
    return id ? [{ permission_id: id as string, is_allowed: Boolean((item as { isAllowed?: unknown }).isAllowed) }] : [];
  });
}

async function writePermissions(admin: ReturnType<typeof createClient>, userId: string, actorId: string, overrides: unknown) {
  const rows = await permissionRows(admin, overrides);
  const { error: removeError } = await admin.from("user_permissions").delete().eq("user_id", userId);
  if (removeError) fail("Could not replace permission overrides.", 500);
  if (!rows.length) return;
  const { error } = await admin.from("user_permissions").insert(rows.map((row) => ({ ...row, user_id: userId, assigned_by: actorId })));
  if (error) fail("Could not save permission overrides.", 500);
}

async function writeRole(admin: ReturnType<typeof createClient>, userId: string, roleId: string, actorId: string) {
  const { error: removeError } = await admin.from("user_roles").delete().eq("user_id", userId);
  if (removeError) fail("Could not replace the account role.", 500);
  const { error } = await admin.from("user_roles").insert({ user_id: userId, role_id: roleId, assigned_by: actorId });
  if (error) fail("Could not save the account role.", 500);
}

async function writeCustomer(admin: ReturnType<typeof createClient>, userId: string, workspaceId: string, input: Record<string, unknown>) {
  const companyName = clean(input.companyName) || clean(input.fullName);
  if (!companyName) fail("Company or customer name is required.");
  const email = clean(input.email).toLowerCase() || null;
  const phone = clean(input.phone) || null;
  const address = clean(input.address) || null;
  const { data: existingAccess } = await admin.from("customer_portal_access").select("customer_id").eq("profile_id", userId).limit(1).maybeSingle();
  let customerId = existingAccess?.customer_id as string | undefined;
  if (customerId) {
    const { error } = await admin.from("customers").update({ name: companyName, legal_name: clean(input.legalName) || null, email, phone, address, updated_at: new Date().toISOString() }).eq("id", customerId);
    if (error) fail("Could not update the customer record.", 500);
  } else {
    const { data: customer, error } = await admin.from("customers").insert({ workspace_id: workspaceId, name: companyName, legal_name: clean(input.legalName) || null, email, phone, address, status: "active" }).select("id").single();
    if (error || !customer?.id) fail("Could not create the customer record.", 500);
    customerId = customer.id as string;
    const { error: accessError } = await admin.from("customer_portal_access").insert({ workspace_id: workspaceId, customer_id: customerId, profile_id: userId, access_level: clean(input.accessLevel) === "customer_viewer" ? "customer_viewer" : "customer_admin", is_active: true });
    if (accessError) fail("Could not create customer portal access.", 500);
  }
  await admin.from("customer_portal_access").update({ workspace_id: workspaceId, is_active: true, access_level: clean(input.accessLevel) === "customer_viewer" ? "customer_viewer" : "customer_admin", updated_at: new Date().toISOString() }).eq("profile_id", userId);
  return customerId;
}

async function writeEmployee(admin: ReturnType<typeof createClient>, userId: string, workspaceId: string, input: Record<string, unknown>) {
  const employee = input.employee as Record<string, unknown> | undefined;
  if (!employee) return;
  const fullName = clean(input.fullName).split(/\s+/).filter(Boolean);
  const firstName = clean(employee.firstName) || fullName.shift() || "Betanor";
  const lastName = clean(employee.lastName) || fullName.join(" ") || "Staff";
  const { data: existing } = await admin.from("employees").select("id").eq("profile_id", userId).limit(1).maybeSingle();
  const payload = { workspace_id: workspaceId, profile_id: userId, employee_number: `BET-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, first_name: firstName, last_name: lastName, work_email: clean(input.email).toLowerCase() || null, work_phone: clean(input.phone) || null, hire_date: clean(employee.hireDate) || null, employment_status: "active", employment_type: "full_time", work_hours_per_day: 8, work_days_per_week: 5 };
  if (existing?.id) {
    const { error } = await admin.from("employees").update({ workspace_id: workspaceId, profile_id: userId, first_name: firstName, last_name: lastName, work_email: payload.work_email, work_phone: payload.work_phone, hire_date: payload.hire_date, employment_status: "active", employment_type: "full_time", work_hours_per_day: 8, work_days_per_week: 5, updated_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) fail("Could not update the employee record.", 500);
  } else {
    const { error } = await admin.from("employees").insert(payload);
    if (error) fail("Could not create the employee record.", 500);
  }
}

async function audit(admin: ReturnType<typeof createClient>, workspaceId: string, actorId: string, targetId: string | null, action: string, payload: Record<string, unknown>) {
  await admin.from("audit_events").insert({ workspace_id: workspaceId, actor_id: actorId, entity_type: "auth_user", entity_id: targetId, action, payload });
}

async function listUsers(admin: ReturnType<typeof createClient>) {
  const { data: authPage, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) fail("Could not list Auth users.", 500);
  const users = authPage.users ?? [];
  const ids = users.map((user) => user.id);
  const [{ data: profiles }, { data: assignments }, { data: overrides }] = await Promise.all([
    ids.length ? admin.from("profiles").select("id,workspace_id,full_name,job_title,phone_e164,email_address,is_active,account_type,created_at,updated_at").in("id", ids) : Promise.resolve({ data: [] as never[] }),
    ids.length ? admin.from("user_roles").select("user_id,roles(id,code,name,role_type)").in("user_id", ids) : Promise.resolve({ data: [] as never[] }),
    ids.length ? admin.from("user_permissions").select("user_id,is_allowed,assigned_at,permissions(code,module,description)").in("user_id", ids) : Promise.resolve({ data: [] as never[] }),
  ]);
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const rolesById = new Map<string, unknown>();
  for (const assignment of assignments ?? []) rolesById.set(assignment.user_id, Array.isArray(assignment.roles) ? assignment.roles[0] : assignment.roles);
  const overridesById = new Map<string, unknown[]>();
  for (const override of overrides ?? []) overridesById.set(override.user_id, [...(overridesById.get(override.user_id) ?? []), override]);
  return users.map((user) => {
    const profile = profilesById.get(user.id);
    return { id: user.id, email: user.email, phone: user.phone, confirmedAt: user.email_confirmed_at, lastSignInAt: user.last_sign_in_at, createdAt: user.created_at, profile, role: rolesById.get(user.id) ?? null, permissionOverrides: overridesById.get(user.id) ?? [] };
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
    if (!supabaseUrl || !serviceKey) fail("Server-side Supabase credentials are not configured.", 500);
    const authorization = request.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) fail("Authentication is required.", 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) fail("Your session is invalid or expired.", 401);
    const callerId = identity.user.id;
    const { workspaceId, roles: callerRoles } = await callerContext(admin, callerId);
    const body = request.method === "GET" ? {} : await request.json().catch(() => ({}));
    const action = (clean((body as Record<string, unknown>).action) || (request.method === "POST" ? "create" : request.method === "PATCH" ? "update" : request.method === "DELETE" ? "delete" : "list")) as Action;

    if (action === "list") return json({ users: await listUsers(admin) });

    const input = body as Record<string, unknown>;
    const accountType = (clean(input.accountType) || "staff") as AccountType;
    if (action !== "delete" && accountType !== "staff" && accountType !== "customer") fail("Account type must be staff or customer.");
    const role = action === "delete" ? null : await roleFor(admin, clean(input.roleCode), accountType);
    if (role?.code === "SUPER_ADMIN" && !callerRoles.some((candidate) => candidate.code === "SUPER_ADMIN")) fail("Only a super administrator can assign the super administrator role.", 403);

    if (action === "create") {
      const email = clean(input.email).toLowerCase();
      const password = clean(input.password);
      const fullName = clean(input.fullName);
      if (!email || !email.includes("@") || !fullName) fail("Name and a valid email are required.");
      if (!passwordIsStrong(password)) fail("Password must be at least 10 characters and include letters and numbers.");
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
      if (createError || !created.user) fail(createError?.message || "Could not create the Auth user.", 400);
      const userId = created.user.id;
      try {
        const { error: profileError } = await admin.from("profiles").update({ workspace_id: workspaceId, full_name: fullName, job_title: clean(input.jobTitle) || null, phone_e164: clean(input.phone) || null, email_address: email, account_type: accountType, is_active: true, updated_at: new Date().toISOString() }).eq("id", userId);
        if (profileError) fail("Could not create the application profile.", 500);
        await writeRole(admin, userId, role!.id as string, callerId);
        await writePermissions(admin, userId, callerId, input.permissionOverrides);
        if (accountType === "customer") await writeCustomer(admin, userId, workspaceId, { ...input, email });
        if (accountType === "staff") await writeEmployee(admin, userId, workspaceId, { ...input, email });
        await audit(admin, workspaceId, callerId, userId, "created", { email, account_type: accountType, role: role.code });
      } catch (error) {
        await admin.auth.admin.deleteUser(userId);
        throw error;
      }
      return json({ user: { id: userId, email, fullName, accountType, role: role.code }, credentials: { email, password } }, 201);
    }

    const targetId = clean(input.targetUserId);
    if (!targetId) fail("A target user is required.");
    if (targetId === callerId) fail("For safety, an administrator cannot change or delete their own account.", 400);

    if (action === "update") {
      const email = clean(input.email).toLowerCase();
      const password = clean(input.password);
      const authUpdates: { email?: string; password?: string; user_metadata?: Record<string, string> } = {};
      if (email) authUpdates.email = email;
      if (password) {
        if (!passwordIsStrong(password)) fail("Password must be at least 10 characters and include letters and numbers.");
        authUpdates.password = password;
      }
      if (clean(input.fullName)) authUpdates.user_metadata = { full_name: clean(input.fullName) };
      if (Object.keys(authUpdates).length) {
        const { error } = await admin.auth.admin.updateUserById(targetId, authUpdates);
        if (error) fail(error.message, 400);
      }
      const { error: profileError } = await admin.from("profiles").update({ workspace_id: workspaceId, full_name: clean(input.fullName) || null, job_title: clean(input.jobTitle) || null, phone_e164: clean(input.phone) || null, email_address: email || null, account_type: accountType, is_active: input.isActive !== false, updated_at: new Date().toISOString() }).eq("id", targetId);
      if (profileError) fail("Could not update the application profile.", 500);
      await writeRole(admin, targetId, role!.id as string, callerId);
      await writePermissions(admin, targetId, callerId, input.permissionOverrides);
      if (accountType === "customer") await writeCustomer(admin, targetId, workspaceId, { ...input, email });
      else await admin.from("customer_portal_access").update({ is_active: false, updated_at: new Date().toISOString() }).eq("profile_id", targetId);
      if (accountType === "staff") await writeEmployee(admin, targetId, workspaceId, { ...input, email });
      await audit(admin, workspaceId, callerId, targetId, "updated", { email: email || null, account_type: accountType, role: role.code });
      return json({ ok: true });
    }

    if (action === "delete") {
      const { data: targetProfile } = await admin.from("profiles").select("email_address,account_type").eq("id", targetId).maybeSingle();
      await admin.from("profiles").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", targetId);
      await admin.from("customer_portal_access").update({ is_active: false, updated_at: new Date().toISOString() }).eq("profile_id", targetId);
      await admin.from("user_roles").delete().eq("user_id", targetId);
      await admin.from("user_permissions").delete().eq("user_id", targetId);
      const { error } = await admin.auth.admin.deleteUser(targetId);
      if (error) fail(`The application access was disabled, but Auth deletion failed: ${error.message}`, 500);
      await audit(admin, workspaceId, callerId, targetId, "deleted", { email: targetProfile?.email_address ?? null, account_type: targetProfile?.account_type ?? null });
      return json({ ok: true });
    }
    fail("Unsupported account action.");
  } catch (error) {
    const result = safeError(error);
    return json({ error: result.message }, result.status);
  }
});
