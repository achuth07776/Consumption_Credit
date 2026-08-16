# Build Prompt — ConsumptionCredit (Full Working App)

Paste this into Figma Make (or whichever AI app-builder you're using) after
the visual design pass is done. This asks it to build a genuinely working
app — real state, real logic, real data flow — not just clickable frames.

---

## 0. What You're Building

A working web app simulating "Credit Line on UPI" — a consumption credit
platform where a user links a bank/NBFC credit line to a UPI-style VPA,
spends against it like a normal payment, gets scored without needing a
credit bureau, and sees one unified bill across all their credit products.

Build this as a **real full-stack app**: a frontend that calls a backend
with actual persisted state (use whatever database/backend the tool
provides — Supabase, built-in storage, etc.), not mocked-in-memory-only
UI state that resets on refresh. Every action below should actually persist
and be retrievable.

Follow the visual design system already established (ledger/passbook
aesthetic — ruled rows, tabular numerals for money, stamp motif for state
changes, indigo for "own money," rust for "credit line," 4px radius,
IBM Plex Sans + a slab/serif numeral face). Do not deviate from it into a
generic card-based fintech UI.

---

## 1. Data Model (build these tables/entities first)

```
User            id, name, upiVpa, kycStatus, createdAt
CreditLine      id, userId, lenderId, limit, utilized, heldAmount, status, interestRate
Lender          id, name, type (BANK | NBFC)
Merchant        id, name, category
ConsentRecord   id, userId, creditLineId, scope, grantedAt, expiresAt, revokedAt, status
Transaction     id, creditLineId, merchantId, amount, mode (OWN_MONEY|CREDIT_LINE),
                channel (UPI|BNPL), status (INITIATED|PENDING_CONFIRMATION|SETTLED|
                CANCELLED|EXPIRED_AUTO_SETTLED), createdAt, settledAt
RiskAssessment  id, userId, recommendedLimit, tier, signals (json), createdAt
Statement       id, userId, periodStart, periodEnd, totalDue, minimumDue, dueDate, status
StatementLineItem  id, statementId, transactionId, lenderId, amount, description
RepaymentStreak id, userId, consecutiveOnTime, consecutiveFullPayment, lastLateAt
InstallmentSchedule  id, transactionId, userId, creditLineId, installments (json)
AuditLog        id, actorId, action, entityType, entityId, reason, createdAt
```

Enforce relationships properly (foreign keys where the backend supports
it). `Transaction`, `ConsentRecord`, and `AuditLog` rows are append-only —
never update them in place; new state = new row or a status field
transition, never a silent overwrite.

---

## 2. Backend Logic to Implement (one module at a time, in this order)

### Module 1 — Risk Engine
- `POST /risk/assess` — given a userId, compute a composite score from:
  transaction frequency, average ticket size, merchant diversity, bill
  payment regularity, account age. Return a recommended limit (₹1,000–
  ₹1,00,000) and a tier (LOW/MEDIUM/HIGH/INSUFFICIENT_DATA). Store the
  result in `RiskAssessment` with the individual signal contributions —
  this must be inspectable, not a black-box number.
- Seed at least 5 demo users with varied transaction histories so this
  produces genuinely different outcomes (a thin-file user with good bill
  payment history vs. a dormant account vs. a high-frequency spender).

### Module 2 — Consent & Transparency
- `POST /consent/grant` — creates a `ConsentRecord`, links to a
  `CreditLine`.
- `POST /consent/revoke` — marks revoked, does not delete the row.
- `GET /consent/check?userId&creditLineId` — returns valid/invalid;
  every money-moving endpoint below must call this internally before
  proceeding, and must fail closed (treat any error as "not valid").
- On the frontend payment screen, before confirming any credit-mode
  payment, actually call this and display real remaining-limit numbers —
  not a static mock.

### Module 3 — Unified Risk Enforcement
- `POST /enforce` — given a transaction request, run all rule checks
  (limit, consent, credit line status, exposure concentration, channel
  eligibility) and return APPROVED or DECLINED with a specific reason.
  This must be the single gate every transaction (UPI or BNPL) passes
  through — do not duplicate limit-checking logic elsewhere.

### Module 4 — Fraud-Safe Settlement
- `POST /settlement/initiate` — creates transaction, applies delay policy
  (amount > ₹10,000 → PENDING_CONFIRMATION with a real timestamp-based
  1-hour window; otherwise → SETTLED immediately).
- `POST /settlement/confirm` and `POST /settlement/cancel` — real state
  transitions, must update `CreditLine.heldAmount` correctly on cancel.
- Build a background/scheduled check (or a manually-triggerable "advance
  time" demo control, since real schedulers may not be available) that
  auto-settles expired pending transactions.

### Module 5 — Multi-Lender Orchestration
- `POST /route` — attempts the user's linked lenders in priority order,
  each with a genuinely different mock approval condition (e.g., Lender A
  declines above ₹20,000, Lender B always approves within its own limit)
  so fallback behavior is demonstrable, not hardcoded to always succeed.
  Log every attempt.

### Module 6 — Unified Billing
- On every SETTLED transaction, append a `StatementLineItem` to the
  user's open `Statement` for the current period (create one if none
  exists).
- `POST /billing/close-period` — closes a statement, computes totalDue
  and minimumDue.
- `POST /billing/repay` — records a repayment, allocates across lenders
  if the statement spans multiple, emits a repayment-received signal that
  Module 7 actually reads (not just a UI toast).

### Module 7 — Limit Growth Engine
- After each repayment, update `RepaymentStreak`. If eligible (e.g., 4+
  consecutive on-time, full repayments, healthy utilization), call back
  into Module 1's assessment logic with the repayment history as an
  additional signal, and — if approved — actually update
  `CreditLine.limit` and surface a real "stamped" notification on the
  frontend with the reason.

### Module 8 — BNPL Checkout Split
- `POST /bnpl/plans` — given an amount, return valid installment options
  (only if total amount fits within available limit).
- `POST /bnpl/create-schedule` — runs the SAME enforcement/routing/
  settlement path as a normal transaction for the upfront authorization,
  then creates an `InstallmentSchedule` with real future-dated line items
  that Module 6 picks up on their due dates.

---

## 3. Frontend Screens to Wire to Real Data

Build against the design system from the earlier Figma brief. Every
screen below must read/write real backend state — no screen should show
static placeholder numbers once a user has actually transacted.

1. Onboarding/consent — actually calls `POST /consent/grant`
2. Home/Passbook dashboard — pulls real `CreditLine.limit`,
   `utilized`, and recent `Transaction` rows for the logged-in demo user
3. Payment screen — mode toggle actually changes which flow runs
   (own-money vs. real `/enforce` → `/route` → `/settlement/initiate`)
4. Pending confirmation screen — shows a real countdown from the actual
   `PENDING_CONFIRMATION` timestamp, with working confirm/cancel buttons
5. Unified statement screen — renders real `StatementLineItem` rows
   grouped by period, with real totals
6. Repayment screen — actually posts to `/billing/repay` and reflects
   updated balances immediately after
7. Limit growth notification — only appears when Module 7 actually
   triggers it, with the real reason from the backend, not a canned string
8. BNPL checkout — shows real installment previews computed from
   `/bnpl/plans`, and completing it actually creates real future line items
   visible later on the statement screen

---

## 4. Demo Data & Demo Controls

Seed 3–5 demo users with distinct profiles (thin-file good payer, thin-file
risky, established high-frequency user) so every module has something
real to show. Add a small "demo controls" panel (can be hidden/dev-only)
with buttons like "Advance time by 1 day" and "Simulate late payment" so
the team can demonstrate the Limit Growth Engine and auto-settlement
without waiting on real clock time during the presentation.

---

## 5. Non-Functional Requirements

- **Fail closed everywhere:** any backend error on a consent/risk/limit
  check must result in a declined transaction in the UI, never a silent
  success.
- **Audit trail:** every consent grant/revoke, transaction state change,
  and limit change writes an `AuditLog` row. Add a simple (even
  admin-only) screen to view this log — it's what makes the demo
  credible as "compliance-aware," not just a UI mockup.
- **Idempotency:** submitting the same payment twice (e.g., double-tap)
  must not create two transactions — use a client-generated idempotency
  key on the payment endpoint.
- **No hardcoded lender logic in the orchestrator** — lender approval
  rules should live in per-lender config/objects, not inline conditionals
  in the routing function, mirroring the SOLID design from the
  architecture doc.

---

## 6. Acceptance Criteria (what "done" means for tomorrow's demo)

- [ ] A new demo user can link a credit line, get a real risk-based limit
- [ ] That user can make a small payment (settles instantly) and a large
      payment (goes to pending, then confirms or auto-settles)
- [ ] A failed primary-lender payment actually falls back to a second lender
- [ ] The statement screen shows real aggregated line items across at
      least two different lenders/products for one user
- [ ] A repayment actually updates the statement and, after enough
      simulated on-time repayments, triggers a real limit increase shown
      on the dashboard
- [ ] A BNPL split purchase creates future line items that appear on a
      later statement period
- [ ] Every one of the above is backed by real backend state, refreshable
      and demonstrable without relying on the presenter's memory of what
      "should" happen