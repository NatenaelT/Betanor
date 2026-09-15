# Permissions and RLS Strategy

## Initial roles

`SUPER_ADMIN`, `MANAGEMENT`, `ADMIN`, `HR_MANAGER`, `HR_STAFF`, `FINANCE_MANAGER`, `FINANCE_STAFF`, `SALES_MANAGER`, `SALES_STAFF`, `PROJECT_MANAGER`, `TEAM_LEAD`, `TECHNICAL_STAFF`, `SUPPORT_STAFF`, `CONTENT_EDITOR`, `EMPLOYEE`, and `VIEWER` are the master-specified initial role bundles. They remain extensible and map to granular permissions such as `cms.publish`, `quotation.approve`, `task.assign`, `kpi.review`, `payroll.manage`, and `audit.read`.

## Authorization model

Authorization has three layers: Supabase Auth identifies a user; an organization membership assigns one or more roles; PostgreSQL RLS restricts rows by organization and responsibility. Role names below are proposals. Permission grants should be capability-based, with role bundles stored in database configuration or version-controlled seed data.

Phase 5 implements this model with a secure `auth.users → profiles` trigger, 16 seeded system roles, 32 capability records, and database-held role assignments. Identity metadata may set a display name, but never grants a role or permission. The permission helper is in a non-exposed `private` schema, executes with a fixed search path, and is used only by RLS policies.

The role matrix is a capability summary; its columns are mapped to the master-specified role bundles above during Phase 5.

| Capability | Platform Admin | Org Admin | Sales | Delivery | HR | Finance | Strategy | Manager | Employee | Customer |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Organization, roles, integrations | manage | manage | — | — | — | — | — | — | self | — |
| Customers, leads, RFQs | all | all | manage | read assigned | — | read billing | read summary | read team | — | own only |
| Quotations and revisions | all | all | manage | read linked | — | read approved | read summary | approve scoped | — | accept own |
| Contracts and projects | all | all | read | manage | staffing read | financial read | read summary | manage own/team | assigned tasks | own contract/project read |
| Tasks and comments | all | all | read | manage | read assignments | read cost context | read KPI links | team manage | own manage | project visibility only |
| Candidates and recruitment | all | all | — | — | manage | — | — | hiring scoped | — | — |
| Employees, contracts, leave | all | all | — | staffing read | manage | payroll input read | KPI read | approve team leave | self only | — |
| Payroll and expenses | all | all | sales expenses | project expenses | payroll input | manage | financial result read | approve scoped | own requests/payslips | — |
| Strategy, goals, KPIs | all | all | contribute | contribute | people KPI contribute | financial input | manage | team goals/KPIs | own KPIs | — |
| Audit and security logs | read | read scoped | — | — | HR scoped | finance scoped | — | — | — | — |

`all` is organization-scoped; platform administration should only exist for a trusted internal operator and is not a normal customer-organization role.

## RLS policy pattern

1. Enable RLS on every public-schema tenant table.
2. Require `organization_id` and use a security-definer membership helper that validates `auth.uid()` membership without recursive policy evaluation.
3. `SELECT`: permit organization membership plus record-specific filters (assigned employee, manager chain, customer portal relationship).
4. `INSERT/UPDATE/DELETE`: require both membership and named capability; use `WITH CHECK` to prevent changing tenant ownership or impersonating approvers.
5. Customer-portal rows use a separate portal membership/contact mapping and must never receive staff privileges.
6. Storage buckets use object paths prefixed by organization and policies that mirror document access records.
7. Service-role access is server-only, logged, and restricted to approved jobs; no browser client gets it.

### Current Phase 5 access surface

- Public visitors can read only published CMS records; operational records remain non-readable.
- Every authenticated user receives a matching profile automatically, but no workspace placement or role automatically. A trusted administrator must create the employee record and role assignment.
- Signed-in staff can read their own profile, notifications, employee record, leave requests, and payslips. They can create or revise only their own draft leave request.
- Staff holding `leave.approve` can review and approve/reject submitted leave requests within their authorized workspace. Staff holding `payroll.manage`, `hr.read`, `hr.manage`, or `users.manage` receive only the narrow data reads expressly defined for those capabilities.
- CRM, commercial, projects, finance, recruitment, documents, audits, and write-capable CMS data remain deny-by-default until their module-specific implementation phase.

People-module enforcement now follows the same least-privilege model: `hr.read` can read employee and contract records, `hr.manage` can create/update employee profiles, positions, contracts, vacancies, candidates, and applications, and `recruitment.manage` can operate the recruitment pipeline. HR can read eligible staff profiles to link an employee to an authenticated portal account. Employees can read their own profile/contract and request leave with `leave.request`; an immediate manager can move a direct report's submitted leave to `in_review`, while HR (`hr.manage`) is required to approve or reject. Public visitors can only read currently active, date-valid job openings and can submit applications through the validated public RPC; candidate records remain hidden from anonymous and non-HR roles.

### Phase 7 CMS access surface

- `industries`, `services`, `case_studies`, and `insights` now use RLS-backed editorial permissions. Public visitors retain read access only to active/published records.
- A CMS writer (`cms.write`) can read the editorial collections and create or revise a draft. A CMS publisher (`cms.publish`) can release a record and set its publication time.
- Every CMS insert and update is recorded in `audit_events` with the actor, entity, action, slug, status, and publication timestamp. The audit trigger has a fixed safe search path and cannot be invoked directly by browser roles.

### Phase 8 catalogue access surface

- `product_categories` and `products` follow the same `cms.read`, `cms.write`, and `cms.publish` access model as the Phase 7 editorial collections. This avoids duplicate role assignments and lets a later catalogue-specific role be added only if the business requires it.
- Category and product writers can create and revise drafts; publishers control release. Public callers can select only active records with a publication timestamp.
- Catalogue writes use the protected CMS audit function and have no browser delete permission, preserving a traceable commercial catalogue history.

## Sensitive-data controls

- Payslips, compensation, bank/tax identifiers, medical/leave detail, candidate attachments, and signed contracts need narrow policies and audit reads.
- Approval decisions must bind approver identity, scope, timestamp, and decision; never trust a client-supplied approver ID.
- Use private storage buckets; issue short-lived signed URLs after a server/RLS authorization check.
- Enforce MFA for privileged roles if product tier supports it. Rate-limit public RFQ and chat intake, apply CAPTCHA/abuse controls, and validate uploads.
- Public users may only read published content, submit RFQ/consultation/job applications, start/send their own guest-chat messages, and access a specifically shared quotation. They must never list internal records or other guest conversations.

## Segregation of duties

No single ordinary role should create, approve, and pay the same expense. Finance finalization of payroll should be separated from HR data preparation; contract acceptance should preserve customer consent evidence; role changes and RLS helper changes require an audited administrator action.
