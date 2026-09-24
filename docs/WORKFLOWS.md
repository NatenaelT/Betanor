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

12. **Tender to final submission:** authorized staff create a tender → assign proposal/cost-proposal tasks → add mandatory requirements → request/issue CPO or bank guarantee records → prepare a linked official submission letter → complete the final checklist → authorized submitter confirms the immutable snapshot → tender moves to `SUBMITTED`. A second submission is rejected by the unique tender constraint; corrections use a new tender correspondence record or controlled tender amendment rather than rewriting the snapshot.

13. **Tender security expiry:** guarantee issue/expiry and responsible staff are recorded against the tender → the idempotent daily reminder function creates 14/7/3/1-day in-app notification events (and queues email/Telegram delivery asynchronously) → release/return status and date are recorded without deleting the original security history.

14. **RTSL support request:** authenticated RTSL contact submits a support request → database assigns `BTNR-TKT-YYYY-XXXXX` under a concurrency-safe yearly sequence → creates the canonical chat conversation and initial message → assignment and status changes use RBAC-checked RPCs → technician communicates with the customer through realtime chat and private attachments → remote/video/onsite session details and work log are recorded → technician marks resolved → customer confirms to close. The RTSL recurring onsite window is Thursday 09:00–12:00 East Africa Time.

15. **Support notifications:** ticket insert/assignment/status transition writes in-app notification rows where enabled and queues email/Telegram outbox events according to each profile's support preferences. Telegram linking and message delivery use the same Supabase Edge Function; pg_net kicks it after enqueue and a one-minute Supabase Cron job retries queued events. Each attempt occurs asynchronously and cannot hold up a ticket/chat transaction.

## Cross-workflow controls

Use an approval policy engine with amount, department, project, data sensitivity, and delegation inputs. Every side effect is idempotent, recorded through the outbox, and visible in an audit timeline.

## Updated employee registration and account provisioning (Phase A)

1. HR/Admin opens **People → Employees → New employee** and records HR data (name, work email, department, position, manager, start date, employment type and contract details).
2. If **Create system access** is selected, the server validates the work email, staff role, and caller permission. The browser never creates Auth users directly.
3. For **Invite employee**, the Edge Function calls Supabase Auth invitation delivery. For **Temporary password**, it creates an Auth user with a minimum eight-character password and sets `profiles.password_change_required = true`; the password is never written to Betanor tables.
4. The function creates/links the `profiles` row, assigns the database role and permission overrides, creates/links the `employees` row, and writes `employee_access`. It generates the employee number through the database trigger. Failure removes newly-created Auth/employee records before returning an error.
5. The employee activates the invitation or signs in with the temporary password. Temporary-password accounts are redirected to `/account/change-password` and cannot continue until the flag is cleared.
6. HR/Admin can resend an invitation, request a password reset, change role/department/manager, or set access to `active`, `suspended`, `disabled`, or `employment_ended`. Suspension/disable/end bans Auth and marks the profile inactive; historical work is retained.
7. Every provision, invitation, reset request, status change, role change, and deletion writes an `audit_events` record. No administrator can view a current password.

## Support workflow (planned Phases B–H)

### Guest request to ticket

Guest/customer submits the minimal **Get IT Support** form or chat → server validates/rate-limits and generates `BTNR-SUP-YYYY-XXXXX` → customer receives acknowledgement → support triages and creates `BTNR-TKT-YYYY-XXXXX` → an asynchronous notification event reaches the support team. Guest access is token-scoped and never exposes the staff workspace.

### Ticket to resolution

Ticket is acknowledged → assigned to a support team/technician → technician and customer exchange realtime messages and private attachments → ticket may schedule remote, video, phone, or on-site support → SLA/escalation timers create notification events → technician records resolution → customer confirms/rates → ticket closes. Internal notes remain staff-only.

### Video support

Authorized participant requests video → server checks ticket membership and creates a short-lived provider token/room → customer and technician join through a dynamically loaded WebRTC/provider adapter → call metadata is linked to the ticket after completion. Recording is off by default and requires separate consent/policy.

### Notifications

Business transaction commits → durable notification event is created → in-app delivery uses scoped Supabase Realtime; email and Telegram workers deliver asynchronously with retry and webhook-update idempotency. A slow provider never blocks ticket save, employee provisioning, or status transitions.

### Telegram chat linking and messaging

An administrator creates the official bot with BotFather and stores `TELEGRAM_BOT_TOKEN` as a Supabase Edge Function secret → a user with `settings.manage` configures the Telegram webhook from System Configuration → a signed-in user generates a single-use link in My Profile → Telegram `/start` consumes its hashed 10-minute challenge → the bot lists only conversations currently authorized for that Betanor profile → selecting one sets the active thread → plain-text replies are inserted into canonical `chat_messages` and appear in the portal in real time. Users can switch threads with `/tickets`; attachments/screenshots remain in the portal chat. Customer accounts cannot see staff-only conversations; staff-only Telegram chat requires `chat.manage`; internal notes in customer/ticket conversations are never forwarded.

Phase B–H will not be started until Phase A checks and acceptance are complete.
