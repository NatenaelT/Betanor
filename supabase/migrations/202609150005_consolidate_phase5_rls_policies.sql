-- Remove false permissive catch-all policies from Phase 5 tables. The focused policies
-- below are the only browser-access paths, so keeping a redundant `false` policy adds
-- per-row RLS work without providing any extra protection.

drop policy if exists deny_direct_client_access on public.roles;
drop policy if exists deny_direct_client_access on public.permissions;
drop policy if exists deny_direct_client_access on public.role_permissions;
drop policy if exists deny_direct_client_access on public.user_roles;
drop policy if exists deny_direct_client_access on public.employees;
drop policy if exists deny_direct_client_access on public.leave_types;
drop policy if exists deny_direct_client_access on public.leave_requests;
drop policy if exists deny_direct_client_access on public.payslips;

-- The Phase 5 profile policy includes the prior self-read rule.
drop policy if exists "users read their own profile" on public.profiles;
