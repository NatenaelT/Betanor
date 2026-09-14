# Permissions and RLS Strategy

## Initial roles

`SUPER_ADMIN`, `MANAGEMENT`, `ADMIN`, `HR_MANAGER`, `HR_STAFF`, `FINANCE_MANAGER`, `FINANCE_STAFF`, `SALES_MANAGER`, `SALES_STAFF`, `PROJECT_MANAGER`, `TEAM_LEAD`, `TECHNICAL_STAFF`, `SUPPORT_STAFF`, `CONTENT_EDITOR`, `EMPLOYEE`, and `VIEWER` are the master-specified initial role bundles. They remain extensible and map to granular permissions such as `cms.publish`, `quotation.approve`, `task.assign`, `kpi.review`, `payroll.manage`, and `audit.read`.

## Authorization model

Authorization has three layers: Supabase Auth identifies a user; an organization membership assigns one or more roles; PostgreSQL RLS restricts rows by organization and responsibility. Role names below are proposals. Permission grants should be capability-based, with role bundles stored in database configuration or version-controlled seed data.

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

## Sensitive-data controls

- Payslips, compensation, bank/tax identifiers, medical/leave detail, candidate attachments, and signed contracts need narrow policies and audit reads.
- Approval decisions must bind approver identity, scope, timestamp, and decision; never trust a client-supplied approver ID.
- Use private storage buckets; issue short-lived signed URLs after a server/RLS authorization check.
- Enforce MFA for privileged roles if product tier supports it. Rate-limit public RFQ and chat intake, apply CAPTCHA/abuse controls, and validate uploads.
- Public users may only read published content, submit RFQ/consultation/job applications, start/send their own guest-chat messages, and access a specifically shared quotation. They must never list internal records or other guest conversations.

## Segregation of duties

No single ordinary role should create, approve, and pay the same expense. Finance finalization of payroll should be separated from HR data preparation; contract acceptance should preserve customer consent evidence; role changes and RLS helper changes require an audited administrator action.
