# Betanor Digital Business Platform — Phase 0 Architecture

## Audit baseline

This repository contains only an unborn `main` Git branch and `.git` metadata. There is no source code, package manifest, Next.js configuration, Supabase project/configuration, database migration, authentication implementation, RLS policy, environment file, brand asset, website, or workspace functionality to inspect. The authoritative 2,792-line master specification was supplied separately on 2026-09-14 and governs this proposal. The official logo and letterhead referenced by that specification were not supplied in the repository or attachment set.

## Proposed platform shape

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

- Multi-tenant from the first migration: every tenant-owned record carries `organization_id`.
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
