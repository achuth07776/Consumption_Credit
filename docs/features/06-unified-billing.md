# Feature 06 — Unified Billing & Repayment

## Gap This Fills
super.money now stitches together superCard, superCash, BharatX BNPL, and
Kotak811-linked products — likely producing fragmented statements across
products, each with its own due date and repayment flow. We fill this with
one consolidated bill and one repayment action across all credit products a
user holds.

## Build Prompt

Build a `BillingEngine` that subscribes to settled transactions across every
credit line and channel a user has, and produces **one unified statement**
with a single due date and single repayment action — regardless of how many
underlying lenders or products are involved.

Design a `Statement` model: `id, userId, billingPeriodStart, billingPeriodEnd,
lineItems: List<StatementLineItem>, totalDue, minimumDue, dueDate, status`.
Each `StatementLineItem` references the source `creditLineId`, `lenderId`,
and `transactionId` — so the underlying detail is fully traceable even
though the user sees one number.

Implement `BillingEngine` with:
- `onTransactionSettled(Transaction)` — event handler subscribed to
  `TransactionCreated` from `04-fraud-safe-settlement`; appends a line item
  to the user's current open statement (creating one if none exists for the
  period).
- `generateStatement(userId, period) -> Statement` — closes the billing
  period, computes `totalDue` and `minimumDue` (e.g., a configurable % of
  total, per lender's terms — don't hardcode one universal minimum-due rule
  if different lenders have different terms; use a `MinimumDueCalculator`
  interface per lender or a default one).
- `recordRepayment(statementId, amount) -> RepaymentResult` — applies a
  repayment. If the user has balances across multiple lenders, decide and
  document an allocation policy (simplest: pay off highest-interest-rate
  lender's portion first) via a pluggable `RepaymentAllocationStrategy`
  interface — don't hardcode allocation order inline.
- Emits `RepaymentReceived` event on successful repayment, consumed by
  `07-limit-growth-engine`.

Apply these principles:
- **SRP:** `BillingEngine` aggregates and calculates; it does not itself move
  money or talk to lenders directly — repayment execution against a lender's
  system would be a separate `PaymentExecutor` dependency, injected, not
  built inline here.
- **OCP:** a new credit product type (e.g., BNPL installments from Feature
  08) should show up correctly in the unified statement by conforming to the
  `StatementLineItem` shape — no changes to `BillingEngine`'s core logic
  required.
- **Composite-like aggregation:** think of the `Statement` as aggregating
  heterogeneous line items (a UPI credit spend, a BNPL installment, interest
  accrual) behind one uniform interface, so the totalling logic doesn't care
  about the source type.
- **Immutability:** once a `Statement` is `CLOSED` (period ended, due date
  set), its line items should not be mutated — corrections go through an
  explicit adjustment line item, preserving audit history.

Write test cases: transactions across two different lenders correctly
aggregate into one statement with one `totalDue`; minimum due is calculated
correctly per lender-specific terms; a partial repayment is allocated
according to the configured strategy; a repayment event is correctly emitted
and payload includes enough data for the Limit Growth Engine to evaluate
timeliness (on-time vs late).

## Design Summary

```
class Statement {
  id, userId, billingPeriodStart, billingPeriodEnd
  lineItems: List<StatementLineItem>
  totalDue, minimumDue, dueDate, status
}

interface MinimumDueCalculator { calculate(statement: Statement, lenderId): number }
interface RepaymentAllocationStrategy { allocate(amount, statement): Map<lenderId, number> }

class BillingEngine {
  onTransactionSettled(txn: Transaction): void
  generateStatement(userId, period): Statement
  recordRepayment(statementId, amount): RepaymentResult
}
```

## Integration Points
- Subscribes to `TransactionCreated` from `04-fraud-safe-settlement`.
- Emits `RepaymentReceived`, consumed by `07-limit-growth-engine`.
- Line items must be shape-compatible with `08-bnpl-checkout`'s installment
  records.
