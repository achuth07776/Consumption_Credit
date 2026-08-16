1. Fix First — Limit Growth Must Require Explicit Consent

This is a correction, not a new feature. RBI's digital lending rules prohibit automatically increasing a borrower's credit limit without their fresh, explicit consent. Update the existing Limit Growth Engine:

Change applyLimitIncrease() so it no longer silently updates CreditLine.limit. Instead, it creates a LimitProposal record (id, userId, currentLimit, proposedLimit, reason, status: PENDING) and surfaces it via the existing notification/stamp system.
Add POST /limit/accept-proposal and POST /limit/decline-proposal — only accept actually mutates CreditLine.limit, and it must create a ConsentRecord for this specific increase, reusing the existing consent module rather than a parallel mechanism.
Frontend: the existing Limit Growth notification screen becomes an actionable card with "Accept new limit" / "Not now" — not a passive announcement.
2. Key Fact Statement (KFS) — Pre-Borrowing Disclosure

Add a standardized disclosure shown before a user's first credit-line spend, and revisitable any time from the dashboard.

Data
KeyFactStatement
  id, creditLineId, apr, totalInterestIfMaxUtilized, allFees (json),
  recoveryTermsSummary, coolingOffDays, generatedAt
Backend
GET /kfs/:creditLineId — computes/returns the KFS using the CreditLine.interestRate and lender config already in the system. Do not hand-wave the APR number — compute it from the actual configured interest rate + any fees, so it's a real calculated figure, not a placeholder string.
Frontend
A dedicated Key Fact Statement screen, styled consistently with the ledger design system (this is a ledger document, lean into it — treat it visually like a formal passbook entry page, not a generic terms modal). Must show: APR in large, unavoidable type (not buried), total cost example ("If you borrow ₹10,000 and repay over 3 months, you'll pay ₹___ in interest"), all fees itemized, and the cooling-off period.
Required to be shown (not skippable) the first time a user links a credit line, before consent is granted — insert this step into the existing onboarding flow between phone/KYC and consent-granting.
3. Cooling-Off / Right to Exit
Add coolingOffExpiresAt to CreditLine (set at creation: createdAt + coolingOffDays).
POST /credit-line/exit-cooling-off — only callable before coolingOffExpiresAt; closes the credit line, calculates amount owed as principal + proportionate APR only (no penalty fee), creates a final settlement line item.
Frontend: a visible, unhidden "Exit within cooling-off period" option on the credit line detail screen while still within the window — don't bury this in settings; RBI's intent is that it's genuinely easy to find.
4. Grievance Redressal
GrievanceTicket model: id, userId, category, description, status (OPEN|IN_PROGRESS|RESOLVED), createdAt, resolvedAt
POST /grievance/raise, GET /grievance/mine, and (admin-gated) GET /grievance/all + POST /grievance/:id/resolve
Frontend: a simple "Raise a concern" screen accessible from the dashboard, plus a static "Nodal Grievance Officer" contact card (mock name/email/phone, clearly labeled as demo contact info) — this small screen carries real credibility weight in a fintech demo.
5. Per-Transaction Interest Preview
Before confirming any credit-mode payment, show a small real-time calculation: "This will cost approximately ₹X in interest if not repaid by the due date" — computed from the credit line's actual rate, not a static disclaimer. Insert this into the existing payment confirmation screen, don't create a separate flow.
6. Statement PDF Export
GET /billing/statement/:id/pdf — server-side generate a simple, clean PDF of the statement (reuse the ledger typography/line-item structure already in the design system — this should look like the same passbook, not a generic invoice template).
Frontend: "Download statement" button on the existing statement screen.
7. Spending Insights
GET /insights/:userId — aggregate existing Transaction data by merchant category over the current/recent billing periods. No new data needs to be captured — this reads existing transaction history.
Frontend: a simple category breakdown (ruled-list style, consistent with the design system — avoid a generic pie-chart-with-legend widget; a ranked ledger list of "Category — amount — % of spend" fits the visual language better) on the dashboard or a dedicated insights screen.
8. Autopay / Repayment Mandate
RepaymentMandate model: id, userId, creditLineId, type (FULL|MINIMUM), active, createdAt
POST /mandate/setup, POST /mandate/cancel
On statement close (billing/close-period), if an active mandate exists, automatically trigger billing/repay for the mandated amount — reuse existing repayment logic, don't duplicate it.
Frontend: a toggle on the statement/repayment screen — "Autopay minimum due" / "Autopay full due" / off.
9. Hindi/English Toggle
Add a simple i18n layer (a key-value string map is sufficient for a demo — doesn't need a full i18n library) covering the core user-facing screens: onboarding, dashboard, payment, statement, KFS. A language-toggle control in the header.
Money amounts and dates should follow Indian formatting (₹ with lakh/ crore grouping where natural, DD-MM-YYYY) regardless of language.
10. Test Coverage
Add unit tests for the modules where correctness actually matters most in a judged demo:
Risk Engine: at least the 3 test cases already specified in docs/features/01-risk-engine.md (thin-file-but-good-payer, high-frequency-low-diversity, near-dormant)
Unified Risk Enforcement: a rule failing correctly declines the whole transaction; a rule throwing is treated as decline (fail-closed)
Settlement state machine: invalid transitions are structurally rejected
OTP verify: exceeding attempt limit invalidates the challenge
These don't need to be exhaustive — a handful of well-chosen tests per module, runnable with one command, is what matters for the demo.
11. Non-Functional / Consistency Requirements
Every new screen must match the existing passbook/ledger design system exactly (Fraunces for money, Public Sans for UI, 4px radius, ruled lines, stamp motif for state changes) — do not introduce new visual patterns for these additions.
Every new backend endpoint follows the existing project's error-response shape, auth-gating pattern (via getCurrentUser()/session check), and file/module organization already established in supabase/functions/server/.
Fail closed everywhere new logic touches money or consent — matches the discipline already applied in the first three rounds.
Update docs/ARCHITECTURE.md and the relevant docs/features/*.md files if any of these additions change a previously-documented design decision (e.g., the Limit Growth Engine fix in Section 1) — keep docs and code in sync, don't let them drift.
12. Final Acceptance Criteria
 A proposed limit increase requires explicit user acceptance before CreditLine.limit changes — verified by attempting to bypass it
 KFS is shown and is unskippable before a user's first credit-line consent grant, with a real computed APR figure
 Cooling-off exit works within the window and correctly stops working after coolingOffExpiresAt
 A grievance can be raised and appears on the admin-side list
 Payment confirmation shows a real interest estimate, not a static string
 A statement can be downloaded as a PDF that visually matches the app
 Insights screen shows real category breakdowns from actual seeded transaction data
 Autopay mandate, once set, actually triggers repayment on period close
 Language toggle switches all core screens without breaking layout
 Test suite runs with one command and passes
13. If Time Runs Out — Priority Order

If the full list can't be finished before the deadline, build in this order — each one earlier is higher compliance/credibility value per hour of work: (1) Limit increase consent fix → (2) Key Fact Statement → (3) Grievance redressal → (4) Cooling-off exit → (5) per-transaction interest preview → (6) test coverage → (7) statement PDF → (8) insights → (9) autopay → (10) language toggle. Items 1–4 are the ones a judge familiar with RBI's digital lending rules would specifically look for; items 8–10 are polish.

Content

PDF