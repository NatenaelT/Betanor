# Proposed Route Map

The route map below records the target App Router surface. Public and core workspace routes marked as implemented are live; remaining routes stay planned until their module phase is approved.

| Area | Proposed paths | Access |
|---|---|---|
| Public site | `/`, `/about`, `/services`, `/products`, `/solutions`, `/industries`, `/insights`, `/company`, `/careers`, `/contact` | public (`/careers` reads active Supabase job openings) |
| Public intake | `/rfq`, `/consultation`, `/chat`, `/q/[secure-token]` | public/token holder |
| Auth | `/login`, `/auth/callback`, `/invite/accept`, `/reset-password`, `/account/change-password` | public/session (change-password requires an authenticated session) |
| Customer portal | `/portal`, `/portal/rfqs`, `/portal/quotations/[id]`, `/portal/contracts/[id]`, `/portal/projects/[id]` | mapped customer contact |
| Workspace | `/workspace`, `/workspace/inbox`, `/workspace/search`, `/workspace/calendar` | staff |
| CRM & sales | `/workspace/customers`, `/workspace/leads`, `/workspace/rfqs`, `/workspace/quotations`, `/workspace/contracts`, `/workspace/chats` | sales/scoped staff |
| Delivery | `/workspace/projects`, `/workspace/projects/[id]`, `/workspace/tasks`, `/workspace/tasks/[id]`, `/workspace/my-work` | delivery/scoped staff (implemented) |
| HR | `/workspace/recruitment`, `/workspace/jobs`, `/workspace/employees`, `/workspace/employees/[id]`, `/workspace/leave`, `/workspace/payslips` | HR/scoped staff (`recruitment`, employee profiles, and leave implemented) |
| Finance | `/workspace/finance`, `/workspace/expenses`, `/workspace/budgets`, `/workspace/invoices` | finance/scoped staff (implemented dashboard, expense approvals, budgets, invoices/payments) |
| Strategy | `/workspace/annual-plan`, `/workspace/goals`, `/workspace/kpis`, `/workspace/reports` | management/scoped staff |
| Content & docs | `/workspace/products`, `/workspace/services`, `/workspace/insights`, `/workspace/cms`, `/workspace/documents`, `/workspace/templates` | scoped staff |
| Administration | `/workspace/admin/users`, `/workspace/admin/roles`, `/workspace/admin/departments`, `/workspace/admin/workflows`, `/workspace/admin/settings`, `/workspace/admin/audit-logs` | administrators |
| Tender management | `/workspace/tenders`, `/workspace/tenders/[id]` | tender-scoped staff; guarantees, checklist, submission letter, and final snapshot follow RBAC |
| Personal area | `/workspace/profile` | authenticated staff; own profile fields and private avatar |
| Employee access API | `/api/admin/employee-access` | HR/admin server boundary; invitation, reset, status, and provisioning actions |

## Support routes (planned, gated after Phase A)

| Area | Planned paths | Access |
|---|---|---|
| Staff support | `/workspace/support`, `/workspace/support/tickets`, `/workspace/support/customers`, `/workspace/support/sessions`, `/workspace/support/visits`, `/workspace/support/contracts`, `/workspace/support/kb`, `/workspace/support/reports` | support-scoped staff |
| Customer support | `/portal/support`, `/portal/support/tickets`, `/portal/support/tickets/[id]`, `/portal/support/appointments`, `/portal/support/video/[id]`, `/portal/support/kb` | authenticated customer, tenant-scoped |
| Public support intake | `/support`, `/support/request` | guest or authenticated customer; rate-limited |

Route access is a usability guard only. Each loader, action, API endpoint, and database query must independently authorize access.

Phase 8 implements `/workspace/products` as a protected catalogue console and turns `/products` into a dynamic public catalogue reading only published product records.

Payroll managers can edit draft payroll directly at `/workspace/payslips`; each cycle exposes Excel-compatible, Word-compatible, and PDF downloads through `/api/payroll/cycles/[id]/export/[format]`.
