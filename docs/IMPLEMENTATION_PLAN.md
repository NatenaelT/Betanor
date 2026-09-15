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
