# Database Architecture

## Status and conventions

No database schema or migrations currently exist. This is a conceptual model only; it authorizes no production tables. All tenant-owned entities have `organization_id`, `id`, `created_at`, `updated_at`, and (where appropriate) `created_by`. Use UUID keys, `timestamptz`, ISO-4217 currency code, and integer minor-unit money fields.

## Conceptual ERD

```mermaid
erDiagram
  ORGANIZATION ||--o{ MEMBERSHIP : has
  USER ||--o{ MEMBERSHIP : joins
  ORGANIZATION ||--o{ CUSTOMER : owns
  CUSTOMER ||--o{ CONTACT : has
  CUSTOMER ||--o{ LEAD : originates
  LEAD ||--o{ RFQ : qualifies_to
  CONTACT ||--o{ RFQ : requests
  RFQ ||--o{ QUOTATION : priced_as
  QUOTATION ||--o{ QUOTATION_VERSION : versions
  QUOTATION ||--o| CONTRACT : accepted_as
  CONTRACT ||--o{ PROJECT : authorizes
  PROJECT ||--o{ TASK : contains
  PROJECT ||--o{ FINANCE_TRANSACTION : incurs
  CUSTOMER ||--o{ INVOICE : billed
  CONTRACT ||--o{ INVOICE : supports

  CANDIDATE ||--o{ RECRUITMENT_APPLICATION : submits
  RECRUITMENT_REQUISITION ||--o{ RECRUITMENT_APPLICATION : receives
  RECRUITMENT_APPLICATION ||--o| EMPLOYEE : hired_as
  EMPLOYEE ||--o{ EMPLOYMENT_CONTRACT : signs
  DEPARTMENT ||--o{ EMPLOYEE : assigns
  EMPLOYEE ||--o{ TASK : performs
  EMPLOYEE ||--o{ KPI_ASSIGNMENT : owns
  EMPLOYEE ||--o{ LEAVE_REQUEST : requests
  EMPLOYEE ||--o{ PAYSLIP : receives

  COMPANY_STRATEGY ||--o{ ANNUAL_GOAL : sets
  ANNUAL_GOAL ||--o{ DEPARTMENT_GOAL : cascades_to
  DEPARTMENT ||--o{ DEPARTMENT_GOAL : owns
  DEPARTMENT_GOAL ||--o{ INITIATIVE : funds
  INITIATIVE ||--o{ PROJECT : delivers
  PROJECT ||--o{ TASK : executes
  KPI ||--o{ KPI_ASSIGNMENT : measures
  ANNUAL_GOAL ||--o{ KPI : measured_by
  DEPARTMENT_GOAL ||--o{ KPI : measured_by
  PROJECT ||--o{ KPI : measured_by
  FINANCIAL_RESULT }o--o{ PROJECT : attributes_to
  FINANCIAL_RESULT }o--o{ ANNUAL_GOAL : informs
```

## Major relationship narratives

### Commercial delivery

`Customer → Lead → RFQ → Quotation → Contract → Project → Task → Finance` is a traceable funnel. A customer can have many leads; a qualified lead can produce RFQs; an RFQ can have multiple quotations and versions, but only an accepted quotation may create a contract. A contract may authorize one or more projects. Project tasks capture delivery effort and can link to approved costs, billable work, invoices, payments, and recognized financial results. Preserve a snapshot of accepted commercial terms so later customer or price changes cannot rewrite history.

### People lifecycle

`Candidate → Recruitment → Employee → Employment Contract → Department → Task → KPI → Leave → Payslip` represents the lifecycle, not a mandatory single linear chain. Candidates apply to requisitions through recruitment applications; a successful application creates or links an employee record. Employees can have multiple time-bounded employment contracts and department assignments. Tasks and KPI assignments tie performance to work. Leave requests affect payroll inputs; a payslip is a period-specific immutable payroll output.

### Strategy execution

`Company Strategy → Annual Goal → Department Goal → Initiative → Project → Task → KPI → Financial Result` aligns work to outcomes. Goals may have several KPIs, and KPIs may be assigned to people, teams, departments, projects, or initiatives. Financial results are periodized facts attributed through explicit allocation records, rather than assuming a one-to-one link.

## Supporting conceptual entities

- `approval_request`, `approval_step`, `approval_decision`: reusable approval workflow for quotations, expenses, leave, contracts, and plans.
- `attachment`, `document_template`, `generated_document`: files and versioned templates stored in Supabase Storage with metadata in Postgres.
- `conversation`, `message`, `rfq_intake`: chat ingestion and human-reviewed RFQ extraction.
- `expense_request`, `expense_line`, `budget`, `budget_allocation`, `finance_transaction`, `invoice`, `payment`.
- `audit_event`, `outbox_event`, `notification`, `comment`, `tag`.

## Authoritative domain inventory mapping

The master specification names the intended physical-table inventory. Before Phase 4, normalize this inventory into a migration plan without losing its traceability: Identity (`profiles`, departments, positions, roles, permissions, user-role/department joins); CMS (services, products, categories, brands, media, posts, careers and site settings); CRM (customers, contacts, leads, opportunities, activities, consultations); RFQ/quotation/contract/chat; project/task/communication; HR/leave/payroll/recruitment; KPI/planning/finance; documents; and platform notifications/activity/audit/media/settings. The conceptual ERD above intentionally groups these implementation tables by bounded context.

Identifiers required by the master specification—`BTNR-CHAT-YYYY-XXXXX`, `BTNR-RFQ-YYYY-XXXXX`, `BTNR-QTN-YYYY-XXXXX`, `BTNR-CTR-YYYY-XXXXX`, `BTNR-EMP-YYYY-XXXXX`, and job application references—should be generated transactionally from organization/year sequences, protected by unique constraints, and never used as the sole authorization secret.

## Data integrity rules

- Enforce allowed state transitions in database functions or carefully permissioned transactional server operations.
- Accepted quotation version, signed contract version, and finalized payslip are immutable; corrective records supersede them.
- A project’s commercial linkage is optional only for internal projects and must be explicitly classified.
- A user identity, employee, candidate, customer contact, and vendor contact are distinct roles linked through a party/contact design if a shared-party abstraction is later approved.
- Avoid a universal polymorphic foreign key for core accounting links; use typed link tables for integrity and reporting.
- Financial management is operational/management finance, not a statutory-accounting replacement; approved records alone feed official financial KPIs.
