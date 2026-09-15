# Proposed Route Map

The route map below records the target App Router surface. Public and core workspace routes marked as implemented are live; remaining routes stay planned until their module phase is approved.

| Area | Proposed paths | Access |
|---|---|---|
| Public site | `/`, `/about`, `/services`, `/products`, `/solutions`, `/industries`, `/insights`, `/company`, `/careers`, `/contact` | public |
| Public intake | `/rfq`, `/consultation`, `/chat`, `/q/[secure-token]` | public/token holder |
| Auth | `/login`, `/invite/accept`, `/reset-password` | public |
| Customer portal | `/portal`, `/portal/rfqs`, `/portal/quotations/[id]`, `/portal/contracts/[id]`, `/portal/projects/[id]` | mapped customer contact |
| Workspace | `/workspace`, `/workspace/inbox`, `/workspace/search`, `/workspace/calendar` | staff |
| CRM & sales | `/workspace/customers`, `/workspace/leads`, `/workspace/rfqs`, `/workspace/quotations`, `/workspace/contracts`, `/workspace/chat` | sales/scoped staff |
| Delivery | `/workspace/projects`, `/workspace/projects/[id]`, `/workspace/tasks`, `/workspace/tasks/[id]`, `/workspace/my-work` | delivery/scoped staff (implemented) |
| HR | `/workspace/recruitment`, `/workspace/jobs`, `/workspace/employees`, `/workspace/leave`, `/workspace/payslips` | HR/scoped staff |
| Finance | `/workspace/finance`, `/workspace/income`, `/workspace/expenses`, `/workspace/receivables`, `/workspace/payables`, `/workspace/budgets` | finance/scoped staff |
| Strategy | `/workspace/annual-plan`, `/workspace/goals`, `/workspace/kpis`, `/workspace/reports` | management/scoped staff |
| Content & docs | `/workspace/products`, `/workspace/services`, `/workspace/insights`, `/workspace/cms`, `/workspace/documents`, `/workspace/templates` | scoped staff |
| Administration | `/workspace/admin/users`, `/workspace/admin/roles`, `/workspace/admin/departments`, `/workspace/admin/workflows`, `/workspace/admin/settings`, `/workspace/admin/audit-logs` | administrators |

Route access is a usability guard only. Each loader, action, API endpoint, and database query must independently authorize access.

Phase 8 implements `/workspace/products` as a protected catalogue console and turns `/products` into a dynamic public catalogue reading only published product records.
