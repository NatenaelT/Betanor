# Proposed Route Map

## Noren first integrated release

- `/workspace/noren` redirects to `/workspace/noren/inbox`.
- `/workspace/noren/inbox` shows the signed-in staff member's canonical notifications, unread and assigned-task filters, read/unread actions and authorized links.
- `/api/noren/notifications` provides recipient-scoped paginated GET and own-read-state PATCH. It does not create notifications.
- `/portal/notifications` shows customer support notifications only for currently authorized customer tickets, with the same read/unread interactions.
- `/workspace/chats` and `/workspace/support` remain the canonical communication routes and appear under Noren navigation. Unimplemented channels/calls are not linked as if available.

The route map below records the target App Router surface. Public and core workspace routes marked as implemented are live; remaining routes stay planned until their module phase is approved.

| Area | Proposed paths | Access |
|---|---|---|
| Public site | `/`, `/about`, `/services`, `/products`, `/solutions`, `/industries`, `/insights`, `/company`, `/careers`, `/contact` | public (`/careers` reads active Supabase job openings) |
| Public intake | `/rfq`, `/consultation`, `/chat`, `/q/[secure-token]` | public/token holder |
| Auth | `/login`, `/auth/callback`, `/invite/accept`, `/reset-password`, `/account/change-password` | public/session (change-password requires an authenticated session) |
| Customer portal | `/portal`, `/portal/rfqs`, `/portal/quotations/[id]`, `/portal/contracts/[id]`, `/portal/projects/[id]` | mapped customer contact |
| Workspace | `/workspace` (role-filtered module landing), `/workspace/overview` (personalized dashboard), `/workspace/inbox`, `/workspace/search`, `/workspace/calendar` | staff; module and dashboard data filtered by permissions |
| CRM & sales | `/workspace/customers`, `/workspace/leads`, `/workspace/rfqs`, `/workspace/quotations`, `/workspace/contracts`, `/workspace/chats` | sales/scoped staff |
| Staff collaboration | `/workspace/chats` | active staff with `chat.manage`; roster presence is private and workspace-scoped; shared task/project records must also pass their own RLS |
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
+## Embedded mailbox and business correspondence
+
+- /workspace/mailbox — account-scoped inbox, sent/drafts/archive/trash, compose, reply/reply-all/forward, flags, signature settings and optional administrator transport settings.
+- /workspace/emails — linked business correspondence register and search.
+- /workspace/emails/new — linked compose route; send uses the authenticated user's connected mailbox.
+- /workspace/emails/[id] — view stored correspondence and linked business records.
+- /workspace/emails/[id]/edit — update the sender's draft.
+- /api/mailbox/connection, /api/mailbox/settings — connect/disconnect a user's registered mailbox and administrator-managed organization server settings.
+- /api/mailbox/messages, /api/mailbox/messages/[id], /api/mailbox/messages/[id]/send, /api/mailbox/messages/[id]/actions — scoped message list/detail, send and mailbox actions.
+- /api/mailbox/sync — bounded IMAP inbox sync for the authenticated mailbox.
+- /api/mailbox/attachments — attach metadata after private resumable upload; /api/mailbox/attachments/[id] creates a short-lived signed download.
+- /api/emails, /api/emails/[id], /api/emails/related-options — existing authenticated correspondence routes with RBAC/RLS.
+
+Letter details offer an email-to-recipient shortcut; project and task details offer linked compose shortcuts. Customer roles do not see the staff mailbox or its APIs.
+
+- /workspace/emails — paginated email register, filtered by status/search and scoped by email RBAC.
+- /workspace/emails/new — compose, save draft, send, and attach verified letter/project/task/tender/quotation/contract/RFQ/customer/support/employee links.
+- /workspace/emails/[id] — view the saved message and linked records; create a follow-up.
+- /workspace/emails/[id]/edit — edit and send the user's own drafts.
+- /api/emails, /api/emails/[id], /api/emails/related-options — authenticated server routes with RBAC and RLS.
+
+Letter details offer an email-to-recipient shortcut, project details offer email-project, and task details offer email-task-team. Customer roles do not see the Emails navigation or API.
