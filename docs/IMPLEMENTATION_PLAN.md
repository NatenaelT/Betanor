# Implementation Plan (Post-Phase 0)

## Gate before Phase 1

Approve the master specification, tenancy model, roles, brand pack, legal/payroll jurisdiction, integration choices, and the open decisions below. Resolve terminology and reporting requirements before producing migrations.

## Recommended order

1. Phases 1–2: foundation, brand/design system, responsive workspace shell.
2. Phases 3, 7–8: public website, CMS, product catalogue and quote-request flows.
3. Phases 4–6: core database, RLS/RBAC, staff authentication and protected workspace.
4. Phases 9–14: CRM, RFQ, quotation/versioning/PDF/sharing, chat, contracts.
5. Phases 15–17: projects, ClickUp-style tasks, internal communications.
6. Phases 18–21: HR core, leave, recruitment, payroll support after compliance approval.
7. Phase 18 (current slice): operational finance dashboard, ETB expenses/approvals, budgets, invoices/payments, and Ethiopian VAT/TIN evidence. Follow with income statements, payroll posting, financial results, and strategy/KPI reporting in the later finance phases.
8. Phases 26–28: document management, reporting, notifications.
9. Phases 29–32: security hardening, testing, deployment, and production verification.

## Definition of ready for each module

Approved domain terms and states; data ownership; RLS policy tests; audit events; error/empty/loading states; responsive accessibility; migration rollback/forward plan; and owner acceptance criteria.

## Updated controlled rollout (master revision 22 Sep 2026)

The earlier phase list remains historical context. The remaining work is now gated as follows:

### Phase A — employee account provisioning (implemented in this slice)

- Add `employee_access` and `profiles.password_change_required` with RLS and indexes.
- Provision/invite Auth users only through the server-side Edge Function; link role, profile, employee, department, manager, and access lifecycle with cleanup on failure.
- Support pending activation, active, suspended, disabled, and employment ended; resend invitation and password-reset actions; first-login password change.
- Add the employee registration UI controls, role selection, access status controls, and `/account/change-password`.
- Run type-check, lint, production build, migration/RLS verification, and the end-to-end acceptance test below. Stop and report before Phase B.

### Phase B — support core

Design and migrate customer-linked support contracts, configurable SLAs, tickets, status history, assignments, attachments, assets, and escalation rules. Add staff RLS and server-side ticket/reference generation.

### Phase C — customer support portal

Add customer-scoped support navigation, guest request intake, ticket history, attachments, appointment visibility, and knowledge-base visibility without exposing workspace/internal notes.

### Phase D — support chat and realtime

Extend existing chat with ticket conversion, technician transfer, scoped Realtime subscriptions, typing/presence/read states, attachments, and internal notes. Keep customer and staff policies separate.

### Phase E — remote/on-site sessions

Add provider-neutral remote session records, scheduled on-site visits, technician mobile forms, service reports, and ticket-linked history.

### Phase F — video support

Add a dynamically loaded provider adapter (WebRTC or approved provider), short-lived server-authorized rooms, participant checks, connection state, and no-recording-by-default policy.

### Phase G — continuous notifications

In-app and Telegram delivery now reuse the scoped notification/outbox architecture with per-user preferences, asynchronous retry, and Telegram update deduplication. Email provider delivery, future push/SMS, and broader event coverage remain to be completed separately.

### Phase H — support dashboards and KPI/reporting

Add SLA/response/resolution metrics, backlog, escalations, technician workload, satisfaction, customer history, and responsive staff/customer dashboards.

## Phase A acceptance gate

1. Provision an employee with invitation and verify exactly one Auth user, profile, employee, role, and `employee_access` relationship.
2. Provision with a temporary password; verify the password is not present in any public table and first login requires a change.
3. Force an Auth/profile/employee failure and verify newly-created records are cleaned up.
4. Resend invitation, request reset, suspend, reactivate, disable, and end employment; verify Auth ban/profile status and preserved HR history.
5. Verify HR/admin authorization, role restrictions, cross-workspace isolation, and direct browser write denial for `employee_access`.
6. Verify invite/reset delivery is asynchronous from later support notification work and does not expose service credentials.

Do not start Phase B until these checks pass and the Phase A report is approved.

## Open decisions requiring approval

1. Is this single-company or true multi-tenant SaaS, and can a user belong to multiple organizations?
2. Where should the supplied master specification be retained/versioned in the repository or project records?
3. Which countries, currencies, tax rules, payroll rules, leave policies, and legal-signature requirements apply?
4. Which roles, approval thresholds, manager hierarchy, and delegation rules are authoritative?
5. What counts as a customer, lead, RFQ, contract, project, and financial result for Betanor’s reporting?
6. Which chat, email, accounting, payroll, e-signature, and notification providers are required?
7. Which brand assets, fonts, and letterhead are approved for web and generated PDFs?
8. What retention, deletion, consent, and data-residency policies apply to customer, candidate, HR, and chat data?
9. Should customers see project progress, invoices, and documents in a portal, and at what granularity?
10. What existing records need import, who owns data quality, and how will reconciliation be signed off?
