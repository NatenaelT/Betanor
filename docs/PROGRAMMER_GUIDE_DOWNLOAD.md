# Betanor Digital Business Platform — Programmer Guide

**Audience:** application developers, database engineers, administrators, and technical maintainers
**Product:** Betanor General Trading P.L.C. digital business platform
**Canonical product specification:** the master specification supplied by Betanor and the maintained architecture records in `docs/`
**Last reconciled:** 22 September 2026

> This guide describes the current repository and separates implemented behavior from planned architecture. A specification requirement is not evidence that a feature is deployed. Check migrations, route code, and this guide's status notes before relying on a capability.

## 1. Product scope

Betanor is an integrated company website and operating platform, not just a brochure site. Its product vision covers public content and catalogue, customer engagement, CRM, RFQs and quotations, contracts, projects and tasks, internal collaboration, HR and recruitment, leave, payroll, finance, strategy/KPIs, documents, dashboards, role-based access, audit, and customer portal access. Support ticketing and several future ERP integrations are planned work, not assumed live capabilities.

The corporate site is `https://betanor.et`. The public company identity is Betanor General Trading P.L.C.; the product positioning in the supplied specification is “One Technology Partner. From Strategy to Support.” Branding is managed centrally where implemented; the exact approved brand pack and regulated document wording remain subject to company approval.

## 2. Repository map

```text
src/app/                 Next.js App Router: public pages, workspace, portal, APIs
src/components/          Shared UI and domain-specific client components
src/lib/                 Supabase clients, authorization context, domain utilities
supabase/migrations/     Ordered SQL schema, RLS, indexes, triggers, functions
supabase/functions/      Server-side Supabase Edge Functions/integrations
docs/                    Maintained architecture, data, permissions, routes, workflows
public/                  Static public assets; the programmer guide is kept private in docs/
```

`supabase/migrations/` is the schema source of truth. Do not modify production schema manually or create tables from a UI screen. Add an ordered migration, review its forward effects and RLS, then apply it through the approved Supabase deployment workflow.

## 3. Technology and local development

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4.
- Supabase Auth, PostgreSQL with RLS, private Storage, and scoped Realtime.
- Vercel for web deployment.
- Package manager: pnpm (see `package.json`).

Typical commands:

```sh
pnpm install
pnpm dev
pnpm lint
pnpm build
```

Use local environment values from an approved secure source. Never commit `.env` secrets, Supabase service-role keys, SMTP credentials, Telegram bot tokens, signing keys, or customer data. Client Supabase configuration may contain only the project URL and publishable/anon key; privileged credentials stay server-side or in Edge Function secrets.

This repository's `AGENTS.md` explicitly warns that the installed Next.js version has changed APIs. Before editing routing, layouts, handlers, or data fetching, read the matching guide under `node_modules/next/dist/docs/`. Prefer the patterns already used in the repository and do not copy examples for a different Next version without checking.

## 4. Application boundaries and routes

| Surface | Route family | Purpose |
|---|---|---|
| Public site | `/`, `/about`, `/services`, `/products`, `/careers`, `/contact`, `/partner`, `/insights` | Published company, service, product, and contact content |
| Authentication | `/login`, `/customer/login`, `/customer/register`, `/auth/callback` | Shared sign-in and customer activation flows |
| Customer portal | `/portal` | Authenticated customer-scoped requests, documents, projects, and billing summary |
| Staff workspace | `/workspace/**` | Permission-scoped operating modules and personal area |
| Admin/system | `/workspace/admin/**`, `/workspace/cms` | User access, organization settings, CMS and catalog controls |
| API | `/api/**` | Authenticated route-handler boundaries for business operations |

Workspace navigation is in `src/components/navigation/workspace-sidebar.tsx`; the server workspace layout resolves role and permissions before rendering it. Customer-facing navigation is separate. A hidden link is not authorization: every page, route handler, server action, and database query must still enforce access.

## 5. Identity, roles, and authorization

Supabase Auth owns credentials, login, and sessions. `profiles` is the application identity. `employees` is the HR record; it is linked, not conflated, through the employee access relationship. Customer records and `customer_portal_access` are separate from staff employment records.

Authorization layers:

1. Auth identifies the actor.
2. Role and direct-permission assignment determine the application's capabilities.
3. Server-side checks enforce business actions and scope.
4. PostgreSQL RLS remains the data-access boundary, including direct API/database requests.

Role permission grants may be adjusted by explicit per-user overrides. Treat `false` overrides as revocations, not as missing grants. Resolve membership, active status, workspace, role, and permissions using existing `resolveWorkspace` behavior before adding a protected staff page. Customer data must be scoped to the linked customer/organization. Internal chat notes, staff records, and financial data must never be exposed to customer policies.

Auth-user creation, role assignment, invitations, and account suspension are privileged operations. Use the existing server-side admin provisioning boundary; never write passwords into application tables, log them, or expose service-role credentials in browser code. See `docs/PERMISSIONS.md` for the current policy model and seeded permissions.

## 6. Current domain map

- **Public/CMS:** published service, product, industry, company, careers, and promotional content.
- **CRM and sales:** customers/contacts, leads, RFQs, quotation versions, quotation decisions, contracts.
- **Delivery:** projects, milestones, tasks, assignees, comments, and linked tender work.
- **People:** candidate applications, employee records, departments/positions, employee access, leave, KPIs, payroll cycles and payslips.
- **Finance:** expenses and approvals, budgets, invoices, payments, and operational finance reporting.
- **Documents:** private document files and official letter workflows, including submitted snapshots.
- **Tenders:** tender register, requirements/checklist, CPO and bank-guarantee tracking, tasks, correspondence, and immutable submission records.
- **Platform services:** profiles, roles/permissions, notifications, audit events, private storage, realtime chat, and shared organization settings.

The conceptual ERD and cross-domain links are maintained in `docs/DATABASE.md`. Preserve the canonical commercial chain `Customer → Lead → RFQ → Quotation → Contract → Project → Task → Finance`; the people and strategy chains are also described there. Reuse canonical entities instead of creating a second customer, employee, department, or document model.

## 7. Data, migrations, and Supabase

- Use UUID primary keys, foreign keys, timestamps, constraints, and query-specific indexes.
- Keep tenant/workspace scope explicit. Use typed foreign keys for important financial or legal relationships rather than unchecked polymorphic IDs.
- Enable RLS for exposed tables. Prefer deny-by-default policies with narrow read/write scopes.
- Put immutable business-state enforcement in SQL constraints/triggers or transactional server functions as appropriate, not only in React controls.
- Use the Supabase server client for authenticated server work and the browser client only for user-scoped operations protected by RLS.
- Keep Storage buckets private for employee, customer, finance, and official-document files. Authorize object paths; issue short-lived signed URLs only after permission checks.
- Realtime subscriptions must be scoped to records the current user may read. Avoid whole-table subscriptions.
- Keep external side effects (email, Telegram, exports, reminders) asynchronous and idempotent when they must not block a committed business action.

Before a migration: inspect the current schema and policies, add indexes for actual query patterns, consider existing data and safe deletion behavior, and document the migration in `docs/DATABASE.md`. After applying it, verify the intended live schema and policies with an authorized database review.

## 8. Business workflows and invariants

The maintained workflows are in `docs/WORKFLOWS.md`. Core patterns include:

- RFQ intake is validated and assigned a server/database-generated reference; sales qualifies it before pricing.
- Quotations are versioned. Acceptance refers to a specific version, and the accepted terms are preserved for contract creation.
- Contracts authorize delivery projects; tasks, finance, and reporting retain traceable links.
- Leave follows an approval chain and affects payroll inputs only through approved records.
- Payroll is edited as a draft, reviewed/approved, then published; a published payslip is a preserved output, not an editable draft.
- Official letters move through `DRAFT → PUBLISHED → SUBMITTED`; submitted originals and their final document snapshots are immutable.
- Tender readiness depends on its required checklist, security evidence, and submission correspondence; final submission is a write-once snapshot.

Never infer a legal, payroll, tax, or regulatory rule from a software default. Ethiopian payroll, tax, leave, procurement, and statutory finance handling require confirmation by authorized Betanor HR, finance, legal, or tax owners.

## 9. Security, privacy, and audit

- Apply least privilege; do not grant every employee publish, submit, payroll, or administration rights by default.
- Check authorization at every server boundary and rely on RLS as defense in depth.
- Validate all input server-side. Sanitize rich text and file names/content types; cap file size and allow only intended formats.
- Do not trust route IDs, organization IDs, role names, or hidden form fields supplied by the browser.
- Audit user provisioning, role/access changes, approvals, publishing/submission, financial decisions, and document operations.
- Use secure invitation/reset links and rate-limited auth flows. Never reveal a stored password (none should be stored).
- Minimize sensitive data in logs, notifications, and downloadable reports. Customer-visible messages must be explicitly separated from staff-only notes.
- Keep final snapshots/hashes for integrity and version history; a content hash is not a digital signature.

## 10. Notifications and chat

Business state commits first; notification delivery follows through the central notification/event architecture. In-app notifications should use the user's scoped permissions. Email and Telegram delivery should respect user preferences, retry safely, and not make the primary transaction wait on a third-party provider. Chat is separated between customer-facing and internal conversations; preserve customer scoping and internal-note visibility.

## 11. Programmer change checklist

For every module change:

1. Read `docs/ARCHITECTURE.md`, `DATABASE.md`, `PERMISSIONS.md`, `ROUTES.md`, and `WORKFLOWS.md` plus the relevant implementation.
2. Confirm whether the capability is implemented, partially implemented, or only planned.
3. Define ownership, lifecycle states, permissions, RLS, audit needs, and failure/empty states before coding.
4. Add a migration for schema changes; do not make ad-hoc production schema edits.
5. Enforce server-side authorization and database policies, then reflect those permissions in navigation/UI.
6. Preserve existing records through correction/versioning rather than rewriting finalized legal/financial history.
7. Keep customer and staff experiences responsive and separate; do not load data the role cannot use.
8. Update the maintained docs and implementation status alongside code.
9. Run the relevant type/lint/build/database checks for the change and fix regressions it introduces.
10. State any external configuration or manual approval still required; do not imply a feature is live until it is deployed and verified.

## 12. Documentation index and important caveats

- `docs/ARCHITECTURE.md` — platform boundaries, principles, implementation status, risks.
- `docs/DATABASE.md` — conceptual ERD, domains, migration inventory, relationships.
- `docs/PERMISSIONS.md` — role/permission and RLS strategy.
- `docs/ROUTES.md` — public, staff, customer, and API route map.
- `docs/WORKFLOWS.md` — business transitions and approval workflows.
- `docs/DESIGN_SYSTEM.md` — brand and interface design record.
- `docs/IMPLEMENTATION_PLAN.md` — rollout order and decisions requiring approval.

The master specification contains a broader product vision than the current code. In particular, planned support operations, video support, some integrations, and some strategy/reporting capabilities must not be presented as production-ready merely because they appear in the specification. Reconcile this guide with the code and migration history when the system changes.
