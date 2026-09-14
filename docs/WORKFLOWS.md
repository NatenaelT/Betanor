# Proposed Workflows

Each workflow requires explicit state transitions, approval rules, notifications, and immutable audit events. Exact states and thresholds await approval.

1. **Public RFQ to accepted quotation:** visitor submits validated RFQ (with attachments) → intake generates `BTNR-RFQ-YYYY-XXXXX`, acknowledges sender, and creates/matches customer/contact → sales triages and qualifies the lead → quotation draft/version is prepared → internal review/approval → customer receives a hashed, expiring `/q/[secure-token]` link → client view/accept/reject/revision request is recorded → acceptance locks the accepted version, marks the commercial opportunity won, and triggers contract preparation.
2. **Manual staff-created quotation:** sales selects existing customer or creates a vetted record → creates quotation independently of RFQ with a source marker → prices lines, terms, taxes, and validity → approval/send/acceptance follows the same quotation controls.
3. **Chat to RFQ:** guest creates `BTNR-CHAT-YYYY-XXXXX` session with secure guest token → consent, spam controls, topic queue, and transcript retention apply → staff assigns/transfers and may convert chat to lead/RFQ/consultation/support request → extraction produces a reviewable RFQ draft → staff confirms facts and customer identity → normal RFQ workflow continues. AI extraction must never auto-commit pricing or contractual terms.
4. **Quotation revision:** customer/staff change request opens a new quotation version → prior sent/accepted version remains preserved → recalculation and approval repeat → only one active version can be sent → acceptance records the accepted version.
5. **Quotation to contract:** accepted quotation creates a contract draft from a versioned snapshot → legal/authorized signatory review → signing evidence and final document stored → contract activates only after all required signatures.
6. **Contract to project:** active contract provisions project template, milestones, budget, staffing, and task backlog → project manager accepts ownership → delivery progress, costs, and billing remain traceable to contract.
7. **Recruitment to employee:** requisition approved → candidate/application progresses through configured stages → offer/acceptance captured → employee and employment contract are created with effective dates → department assignment, access onboarding, and payroll eligibility are reviewed separately.
8. **Leave request and approval:** employee submits dates/type/evidence → balance and conflict validation → manager/HR approval chain → approved leave updates leave ledger and payroll input → cancellation/amendment is auditable.
9. **Salary slip generation:** HR validates employee, compensation, attendance/leave, and adjustments → finance/payroll operator calculates draft → review/approval → period locks → payslip PDF and immutable output published privately → corrections use adjustment/replacement records.
10. **Expense request and approval:** requester enters purpose, project/budget, lines, receipts → policy/budget validation → manager and finance approval according to threshold → reimbursement/payment is recorded → approved expense contributes to project and financial reporting.
11. **Annual planning and KPI review:** leadership publishes strategy and annual goals → departments propose cascaded goals/initiatives/budgets → approval locks baseline → projects/tasks and KPI assignments align to goals → periodic reviews capture actuals, commentary, and financial results → revisions are versioned, not overwritten.

## Cross-workflow controls

Use an approval policy engine with amount, department, project, data sensitivity, and delegation inputs. Every side effect is idempotent, recorded through the outbox, and visible in an audit timeline.
