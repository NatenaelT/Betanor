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
| Personal area | `/workspace/profile`, `/account/profile` | authenticated staff/customer; own profile, private avatar, Telegram link and notification preference |
| Employee access API | `/api/admin/employee-access` | HR/admin server boundary; invitation, reset, status, and provisioning actions |
| Role-based help | `/workspace/help`, `/portal/help` | Signed-in staff and customer manuals; workspace topics are filtered using the current role permissions |
| Programmer guide | `/workspace/admin/guides` | Admin-only technical guide screen with downloadable Markdown guide |

## Support routes (IT Support / Managed Support)

| Area | Planned paths | Access |
|---|---|---|
| Staff support | `/workspace/support`, `/workspace/support/[section]`, `/workspace/support/tickets/new`, `/workspace/support/tickets/[id]` | support-scoped staff |
| Customer support | `/portal/support`, `/portal/support/tickets/[id]` | authenticated customer, tenant-scoped |
| Public support intake | future `/support/request` | guest intake is not in this demo module |

Route access is a usability guard only. Each loader, action, API endpoint, and database query must independently authorize access.

Phase 8 implements `/workspace/products` as a protected catalogue console and turns `/products` into a dynamic public catalogue reading only published product records.

Payroll managers can edit draft payroll directly at `/workspace/payslips`; each cycle exposes Excel-compatible, Word-compatible, and PDF downloads through `/api/payroll/cycles/[id]/export/[format]`.
# IT Support / Managed Support

- `/workspace/support` — assignment-aware staff dashboard.
- `/workspace/support/[section]` — Customers, Contracts, Tickets, Remote, On-site, Assets, Lifecycle, Calendar, Tasks, Documents, SLA, Activity and Reports.
- `/workspace/support/tickets/[id]` — ticket detail, service workflow, activity and live customer chat.
- `/portal/support` — customer support request and ticket status view.

Telegram is configured from the existing `/workspace/admin/settings` page (`settings.manage`) and linked from `/workspace/profile` or `/account/profile`; the Telegram webhook and dispatcher are server-side Supabase Edge Function actions, not public application pages.
+
+## Email correspondence
+
+- /workspace/emails — paginated email register, filtered by status/search and scoped by email RBAC.
+- /workspace/emails/new — compose, save draft, send, and attach verified letter/project/task/tender/quotation/contract/RFQ/customer/support/employee links.
+- /workspace/emails/[id] — view the saved message and linked records; create a follow-up.
+- /workspace/emails/[id]/edit — edit and send the user's own drafts.
+- /api/emails, /api/emails/[id], /api/emails/related-options — authenticated server routes with RBAC and RLS.
+
+Letter details offer an email-to-recipient shortcut, project details offer email-project, and task details offer email-task-team. Customer roles do not see the Emails navigation or API.
