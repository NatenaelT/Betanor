import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

type AccountType = "staff" | "customer";
type Action = "list" | "create" | "update" | "delete" | "provision_employee" | "employee_access";
type AccessStatus = "pending_activation" | "active" | "suspended" | "disabled" | "employment_ended";

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
  // Betanor's baseline is length and breach protection, not arbitrary
  // composition rules. Supabase Auth remains responsible for hashing and
  // credential storage; this function never persists a password.
  return password.length >= 8 && password.length <= 256;
}

async function firstWorkspace(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.from("workspaces").select("id").order("created_at").limit(1).maybeSingle();
  if (error || !data?.id) fail("The Betanor workspace is not configured.", 500);
  return data.id as string;
}

async function callerContext(admin: ReturnType<typeof createClient>, callerId: string, mode: "users" | "employees" = "users") {
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
  const allowedRoles = mode === "employees" ? ["SUPER_ADMIN", "ADMIN", "HR_MANAGER", "HR_STAFF"] : ["SUPER_ADMIN", "ADMIN"];
  const hasRolePermission = roles.some((role) => role.role_type === "staff" && allowedRoles.includes(role.code));
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
  const requestedEmployeeId = clean(employee.employeeId);
  const { data: existing } = requestedEmployeeId
    ? await admin.from("employees").select("id,profile_id").eq("id", requestedEmployeeId).eq("workspace_id", workspaceId).maybeSingle()
    : await admin.from("employees").select("id,profile_id").eq("profile_id", userId).limit(1).maybeSingle();
  if (requestedEmployeeId && !existing?.id) fail("The selected employee record does not belong to this workspace.", 400);
  if (existing?.profile_id && existing.profile_id !== userId) fail("That employee is already linked to another account.", 409);
  const payload = { workspace_id: workspaceId, profile_id: userId, first_name: firstName, last_name: lastName, work_email: clean(input.email).toLowerCase() || null, work_phone: clean(input.phone) || null, hire_date: clean(employee.hireDate) || null, department_id: clean(employee.departmentId) || null, position_id: clean(employee.positionId) || null, manager_id: clean(employee.managerId) || null, employment_status: clean(employee.employmentStatus) || "active", employment_type: clean(employee.employmentType) || "full_time", work_hours_per_day: 8, work_days_per_week: 5 };
  if (existing?.id) {
    const { error } = await admin.from("employees").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) fail("Could not update the employee record.", 500);
  } else {
    const { error } = await admin.from("employees").insert(payload);
    if (error) fail(error.message || "Could not create the employee record.", 500);
  }
}

async function provisionEmployee(admin: ReturnType<typeof createClient>, workspaceId: string, actorId: string, input: Record<string, unknown>, role: { id: string; code: string }) {
  const employee = (input.employee ?? {}) as Record<string, unknown>;
  const email = clean(input.email || employee.workEmail).toLowerCase();
  const fullName = clean(input.fullName) || `${clean(employee.firstName)} ${clean(employee.lastName)}`.trim();
  const method = clean(input.provisioningMethod) === "temporary_password" ? "temporary_password" : "invite";
  const temporaryPassword = clean(input.password);
  if (!email || !email.includes("@") || !fullName) fail("Employee name and a valid work email are required.");
  if (method === "temporary_password" && !passwordIsStrong(temporaryPassword)) fail("The temporary password must be at least 8 characters.");

  let authUserId: string | null = null;
  let employeeId: string | null = clean(employee.employeeId) || null;
  let createdEmployeeRecord = false;
  try {
    const userResult = method === "invite"
      ? await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName, account_type: "staff" }, ...(clean(input.redirectTo) ? { redirectTo: clean(input.redirectTo) } : {}) })
      : await admin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true, user_metadata: { full_name: fullName, account_type: "staff" } });
    if (userResult.error || !userResult.data.user) fail(userResult.error?.message || "Could not create the Supabase Auth account.", 400);
    authUserId = userResult.data.user.id;

    const { data: existingEmployee } = employeeId
      ? await admin.from("employees").select("id,profile_id,workspace_id").eq("id", employeeId).maybeSingle()
      : await admin.from("employees").select("id,profile_id,workspace_id").eq("workspace_id", workspaceId).eq("work_email", email).maybeSingle();
    if (existingEmployee?.workspace_id && existingEmployee.workspace_id !== workspaceId) fail("The employee belongs to another workspace.", 403);
    if (existingEmployee?.profile_id && existingEmployee.profile_id !== authUserId) fail("That employee is already linked to another account.", 409);
    employeeId = existingEmployee?.id ?? employeeId;

    const profileUpdate = { workspace_id: workspaceId, full_name: fullName, job_title: clean(input.jobTitle) || null, phone_e164: clean(input.phone || employee.workPhone) || null, email_address: email, account_type: "staff", is_active: true, password_change_required: method === "temporary_password", updated_at: new Date().toISOString() };
    const { error: profileError } = await admin.from("profiles").update(profileUpdate).eq("id", authUserId);
    if (profileError) fail("Could not create the application profile.", 500);

    await writeRole(admin, authUserId, role.id, actorId);
    await writePermissions(admin, authUserId, actorId, input.permissionOverrides);
    await writeEmployee(admin, authUserId, workspaceId, { ...input, email, employee: { ...employee, employeeId } });
    if (!employeeId) {
      const { data: createdEmployee } = await admin.from("employees").select("id").eq("profile_id", authUserId).maybeSingle();
      employeeId = createdEmployee?.id ?? null;
      createdEmployeeRecord = Boolean(employeeId);
    }
    if (!employeeId) fail("The employee record could not be linked to the Auth account.", 500);

    const accessStatus: AccessStatus = method === "invite" ? "pending_activation" : "active";
    const now = new Date().toISOString();
    const { error: accessError } = await admin.from("employee_access").upsert({ workspace_id: workspaceId, employee_id: employeeId, profile_id: authUserId, access_status: accessStatus, provisioning_method: method, must_change_password: method === "temporary_password", invited_at: method === "invite" ? now : null, last_invitation_at: method === "invite" ? now : null, activated_at: method === "temporary_password" ? now : null, created_by: actorId, updated_by: actorId, updated_at: now }, { onConflict: "employee_id" });
    if (accessError) fail("Could not save the employee access lifecycle.", 500);
    await audit(admin, workspaceId, actorId, authUserId, "employee_access_provisioned", { employee_id: employeeId, method, access_status: accessStatus, role: role.code });
    return { userId: authUserId, employeeId, method, accessStatus, role: role.code };
  } catch (error) {
    if (employeeId && createdEmployeeRecord) await admin.from("employees").delete().eq("id", employeeId).eq("profile_id", authUserId);
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
    throw error;
  }
}

async function updateEmployeeAccess(admin: ReturnType<typeof createClient>, workspaceId: string, actorId: string, input: Record<string, unknown>) {
  const employeeId = clean(input.employeeId);
  if (!employeeId) fail("An employee is required.");
  const { data: access, error: accessError } = await admin.from("employee_access").select("id,employee_id,profile_id,access_status,provisioning_method").eq("employee_id", employeeId).eq("workspace_id", workspaceId).maybeSingle();
  if (accessError || !access) fail("This employee does not have a provisioned system account.", 404);
  const action = clean(input.accessAction) as "set_status" | "resend_invite" | "send_password_reset";
  const { data: user } = await admin.auth.admin.getUserById(access.profile_id);
  const email = user.user?.email;
  if (!email) fail("The employee account has no email address.", 400);
  if (action === "resend_invite") {
    const invite = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: user.user?.user_metadata?.full_name ?? email, account_type: "staff" }, ...(clean(input.redirectTo) ? { redirectTo: clean(input.redirectTo) } : {}) });
    if (invite.error) fail(invite.error.message, 400);
    const now = new Date().toISOString();
    await admin.from("employee_access").update({ access_status: "pending_activation", last_invitation_at: now, invited_at: access.access_status === "pending_activation" ? undefined : now, updated_by: actorId, updated_at: now }).eq("id", access.id);
    await admin.from("profiles").update({ is_active: true, updated_at: now }).eq("id", access.profile_id);
    await audit(admin, workspaceId, actorId, access.profile_id, "employee_invitation_resent", { employee_id: employeeId });
    return { ok: true, accessStatus: "pending_activation" };
  }
  if (action === "send_password_reset") {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anonKey) fail("Supabase password reset delivery is not configured.", 500);
    const publicClient = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const reset = await publicClient.auth.resetPasswordForEmail(email, { redirectTo: clean(input.redirectTo) || undefined });
    if (reset.error) fail(reset.error.message, 400);
    await audit(admin, workspaceId, actorId, access.profile_id, "employee_password_reset_requested", { employee_id: employeeId });
    return { ok: true };
  }
  if (action === "set_status") {
    const status = clean(input.status) as AccessStatus;
    if (!["pending_activation", "active", "suspended", "disabled", "employment_ended"].includes(status)) fail("Unsupported access status.");
    const now = new Date().toISOString();
    const active = status === "active" || status === "pending_activation";
    const authUpdate = await admin.auth.admin.updateUserById(access.profile_id, { ban_duration: active ? "none" : "876000h" });
    if (authUpdate.error) fail(authUpdate.error.message, 400);
    const { error } = await admin.from("employee_access").update({ access_status: status, must_change_password: status === "active" ? access.provisioning_method === "temporary_password" : false, suspended_at: status === "suspended" ? now : null, disabled_at: status === "disabled" ? now : null, employment_ended_at: status === "employment_ended" ? now : null, updated_by: actorId, updated_at: now }).eq("id", access.id);
    if (error) fail("Could not update employee access status.", 500);
    await admin.from("profiles").update({ is_active: active, updated_at: now }).eq("id", access.profile_id);
    await audit(admin, workspaceId, actorId, access.profile_id, "employee_access_status_changed", { employee_id: employeeId, status });
    return { ok: true, accessStatus: status };
  }
  fail("Unsupported employee access action.");
}

async function audit(admin: ReturnType<typeof createClient>, workspaceId: string, actorId: string, targetId: string | null, action: string, payload: Record<string, unknown>) {
  await admin.from("audit_events").insert({ workspace_id: workspaceId, actor_id: actorId, entity_type: "auth_user", entity_id: targetId, action, payload });
}

async function listUsers(admin: ReturnType<typeof createClient>) {
  const { data: authPage, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) fail("Could not list Auth users.", 500);
  const users = authPage.users ?? [];
  const ids = users.map((user) => user.id);
  const [{ data: profiles }, { data: assignments }, { data: overrides }, { data: employeeAccess }] = await Promise.all([
    ids.length ? admin.from("profiles").select("id,workspace_id,full_name,job_title,phone_e164,email_address,is_active,account_type,created_at,updated_at").in("id", ids) : Promise.resolve({ data: [] as never[] }),
    ids.length ? admin.from("user_roles").select("user_id,roles(id,code,name,role_type)").in("user_id", ids) : Promise.resolve({ data: [] as never[] }),
    ids.length ? admin.from("user_permissions").select("user_id,is_allowed,assigned_at,permissions(code,module,description)").in("user_id", ids) : Promise.resolve({ data: [] as never[] }),
    ids.length ? admin.from("employee_access").select("profile_id,employee_id,access_status,provisioning_method,must_change_password,invited_at,activated_at,last_invitation_at,updated_at").in("profile_id", ids) : Promise.resolve({ data: [] as never[] }),
  ]);
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const rolesById = new Map<string, unknown>();
  for (const assignment of assignments ?? []) rolesById.set(assignment.user_id, Array.isArray(assignment.roles) ? assignment.roles[0] : assignment.roles);
  const overridesById = new Map<string, unknown[]>();
  for (const override of overrides ?? []) overridesById.set(override.user_id, [...(overridesById.get(override.user_id) ?? []), override]);
  const employeeAccessByProfileId = new Map((employeeAccess ?? []).map((access) => [access.profile_id, access]));
  return users.map((user) => {
    const profile = profilesById.get(user.id);
    return { id: user.id, email: user.email, phone: user.phone, confirmedAt: user.email_confirmed_at, lastSignInAt: user.last_sign_in_at, createdAt: user.created_at, profile, employeeAccess: employeeAccessByProfileId.get(user.id) ?? null, role: rolesById.get(user.id) ?? null, permissionOverrides: overridesById.get(user.id) ?? [] };
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
    const body = request.method === "GET" ? {} : await request.json().catch(() => ({}));
    const action = (clean((body as Record<string, unknown>).action) || (request.method === "POST" ? "create" : request.method === "PATCH" ? "update" : request.method === "DELETE" ? "delete" : "list")) as Action;
    const { workspaceId, roles: callerRoles } = await callerContext(admin, callerId, action === "provision_employee" || action === "employee_access" ? "employees" : "users");

    if (action === "list") return json({ users: await listUsers(admin) });

    const input = body as Record<string, unknown>;
    if (action === "employee_access") return json(await updateEmployeeAccess(admin, workspaceId, callerId, input));
    const accountType = (clean(input.accountType) || "staff") as AccountType;
    if (action !== "delete" && action !== "provision_employee" && accountType !== "staff" && accountType !== "customer") fail("Account type must be staff or customer.");
    const selectedRoleCode = action === "provision_employee" ? (clean(input.roleCode) || "EMPLOYEE") : clean(input.roleCode);
    const role = action === "delete" ? null : await roleFor(admin, selectedRoleCode, action === "provision_employee" ? "staff" : accountType);
    if (role?.code === "SUPER_ADMIN" && !callerRoles.some((candidate) => candidate.code === "SUPER_ADMIN")) fail("Only a super administrator can assign the super administrator role.", 403);

    if (action === "provision_employee") {
      if (!callerRoles.some((candidate) => candidate.code === "SUPER_ADMIN" || candidate.code === "ADMIN")) {
        // HR roles can provision staff accounts, but cannot grant elevated
        // administration or management roles.
        if (role?.code !== "EMPLOYEE" && role?.code !== "HR_STAFF") fail("HR provisioning may only assign standard staff roles.", 403);
      }
      const result = await provisionEmployee(admin, workspaceId, callerId, input, role!);
      return json({ ok: true, employeeAccess: result }, 201);
    }

    if (action === "create") {
      const email = clean(input.email).toLowerCase();
      const password = clean(input.password);
      const fullName = clean(input.fullName);
      if (!email || !email.includes("@") || !fullName) fail("Name and a valid email are required.");
      if (!passwordIsStrong(password)) fail("Password must be at least 8 characters.");
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
        if (!passwordIsStrong(password)) fail("Password must be at least 8 characters.");
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
