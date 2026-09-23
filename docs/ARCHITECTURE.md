# Betanor Digital Business Platform — Architecture (updated 22 Sep 2026)

## Audit baseline

The repository is a running Next.js App Router application deployed on Vercel and backed by Supabase Auth, PostgreSQL, Storage, and Realtime. The tracked migrations are the source of truth for the current schema. The current production slice includes the public/customer site, staff workspace, CRM/sales, projects/tasks, HR/leave/recruitment, payroll/finance, CMS/catalogue, letters, notifications, and authenticated realtime chat. This document is the maintained architecture record for the updated master specification; support delivery is planned in gated phases and is not implemented by this change.

## Platform shape

Build a modular Next.js (React/TypeScript/Tailwind/shadcn-ui/Lucide) application backed by Supabase PostgreSQL, Auth, Storage, and Realtime; deploy on Vercel. Keep each business domain independently owned while sharing tenant, identity, audit, files, notifications, search, and approval capabilities. Use Next.js Server Actions/Route Handlers for application logic and Edge Functions only for isolated asynchronous/integration work.

```text
Public site / portal ─┐
Staff web application ├─ Next.js `/workspace` (App Router, server actions/API boundary)
Customer portal ──────┘
                              │
                     Supabase Auth + Postgres + Storage + Realtime
                              │
 Domains: CRM | Sales | Contracts | Projects | HR | Finance | Strategy
 Cross-cutting: tenancy | RBAC | approvals | audit | documents | notifications
```

## Architectural principles

- Single Betanor workspace today, with `workspace_id` on tenant-owned records so a future multi-workspace deployment does not require an identity rewrite.
- PostgreSQL is the source of truth; derived documents, exports, and notifications are asynchronous side effects.
- Use opaque UUID primary keys, immutable audit events, timestamps, and optimistic version numbers for editable commercial documents.
- Put authorization in PostgreSQL RLS; application checks improve UX but never replace RLS.
- Use service-role credentials only in tightly scoped server-side jobs. Never expose them to browsers.
- Model business state explicitly with constrained state machines, rather than booleans.
- Store monetary amounts as integer minor units plus ISO currency; do not use floating point.

## Domain boundaries

| Domain | Owns |
|---|---|
| Identity & tenancy | organizations, memberships, roles, profiles |
| CMS & public | services, products, industries, case studies, insights, careers, navigation and settings |
| CRM | customers, contacts, leads, opportunities, consultations, conversations |
| Sales | RFQs, quotation versions, pricing, acceptance |
| Delivery | contracts, projects, tasks, milestones |
| IT Support | support contracts, SLA, tickets, sessions, assets, schedules and lifecycle work; reuses canonical customer, employee, project, task, chat, document and notification records |
| HR | candidates, recruitment, employees, employment contracts, leave, payroll inputs |
| Finance | income, expenses, receivables/payables, payments, payroll outputs, budgets, financial results |
| Strategy | strategies, goals, initiatives, KPIs, reviews |
| Platform | approvals, files, comments, notifications, audit events |

## Integration boundaries

Use an outbox/event table for externally visible effects (email, PDF generation, accounting/HR integrations). A worker consumes idempotent events. Initial integrations, payroll jurisdiction, accounting system, email provider, and chat channel are intentionally undecided.

## Non-functional baseline

- Accessible responsive web UI, Ethiopia-friendly timezone/date/currency localization if confirmed.
- Row-level tenant isolation, append-only audit trail for high-risk operations.
- Automated backups and restore testing before production data.
- Contract/quotation PDFs rendered server-side from versioned snapshots.
- Monitoring for failed jobs, privileged actions, auth failures, and approval bottlenecks.

## Risks

- Brand files are absent, so exact logo use, extracted colors, and letterhead/PDF layout remain unverified.
- CRM, HR, finance, and strategy can each introduce overlapping “person,” “organization,” “goal,” and “cost” concepts; canonical ownership must be enforced.
- Payroll, tax, leave accrual, and contract legality require local policy and legal/accounting approval.
- “Chat to RFQ” requires an explicit supported channel, retention model, consent language, and human review policy.

## Identity and employee access (Phase A)

Supabase Auth owns credentials and sessions. `profiles` is the application identity record created by the Auth trigger. `employees` is HR/employment data and is deliberately separate from `profiles`; its nullable `profile_id` is the relationship, not an identity replacement. `employee_access` is the auditable lifecycle record for that relationship (`pending_activation`, `active`, `suspended`, `disabled`, `employment_ended`).

Provisioning is performed only by the server-side `admin-user-management` Edge Function. It creates/invites Auth, assigns the database role, creates or links the employee, and records access status. Failures clean up newly-created Auth and employee rows. Temporary-password accounts set `profiles.password_change_required`; the first successful sign-in must complete `/account/change-password`. No password is stored in Betanor tables.

## Support architecture boundary (demo module)

The RTSL support demo reuses `customers`, `contracts`, `projects`, `employees`, `tasks`, `profiles`, `notifications`, private chat attachments and existing chat primitives. New support tables are tenant-scoped and customer portal policies are separate from staff workspace policies. Ticket numbering is generated in the database via an atomic per-workspace/year sequence. Assignment, status changes and customer resolution confirmation are authenticated database RPCs. Video remains provider-gated; no unsigned meeting links are generated. In-app notifications are stored synchronously with the business event; email/Telegram delivery is only queued in an outbox and is not delivered until a worker/provider is configured.
# Tender and workspace extensions (September 2026)

Tender management is a separate bounded context inside the existing workspace.
It reuses the platform's profile/RBAC, task, document, letter, notification,
and finance records. The register is server-rendered with indexed, permission-
scoped queries; detail actions use authenticated route handlers. Final tender
submission is a write-once snapshot with a content hash. Database triggers in
`202609220005_tender_immutability.sql` provide defense in depth beyond the UI.

Payroll remains in the existing payroll domain. Draft values are edited through
the authenticated cycle endpoint and published cycles are not editable. The
spreadsheet view is intentionally lightweight and exports Excel-compatible
workbooks, Word-compatible documents, and PDF without loading a heavy office
SDK into the workspace bundle.

Every staff workspace has a personal area at `/workspace/profile`. Avatar files
are private Supabase Storage objects under a user UUID prefix and are rendered
through short-lived signed URLs. `profiles.avatar_path` remains the single
identity reference for both staff and customer-facing profile surfaces.
