# Feature 04 — Fraud-Safe Settlement (Delayed Confirmation for Large Spends)

## Gap This Fills
RBI's 2026 draft rules propose a 1-hour delay on large P2P UPI transfers to
curb fraud, and mandate stronger authentication for high-value transactions.
No current credit-on-UPI app has adapted its settlement flow for this — most
still settle credit spends instantly and irreversibly. We fill this with a
pending/confirmation window for large or risky credit transactions.

## Build Prompt

Build a `SettlementEngine` that finalizes transactions approved by
`03-unified-risk-enforcement`, but introduces a **pending state with a
cancellation window** for transactions above a configurable threshold or
flagged as higher-risk, instead of committing instantly.

Design a `Transaction` state machine (extending the Core Domain
`Transaction` model) with explicit states: `INITIATED -> PENDING_CONFIRMATION
-> SETTLED` or `PENDING_CONFIRMATION -> CANCELLED` or `PENDING_CONFIRMATION
-> EXPIRED_AUTO_SETTLED`. Model this as a proper state machine class
(`TransactionStateMachine`) — do not scatter state transition logic as
if/else checks across the codebase; centralize allowed transitions so an
invalid transition (e.g., `SETTLED -> CANCELLED`) is structurally impossible,
not just "checked."

Implement `SettlementEngine` with:
- `initiateSettlement(TransactionRequest, EnforcementResult) -> Transaction`
  — creates transaction in `INITIATED`, then immediately transitions to
  `PENDING_CONFIRMATION` if it meets the delay criteria, otherwise directly
  to `SETTLED`.
- `confirmSettlement(transactionId) -> Transaction` — used if 2FA/dynamic
  auth succeeds before window expiry (simulate this as a simple confirm call)
- `cancelSettlement(transactionId, reason) -> Transaction` — user or system
  initiated; must reverse any provisional limit hold
- `expireAndAutoSettle(transactionId) -> Transaction` — called by a
  scheduler/cron simulation after the delay window elapses without explicit
  cancellation

Delay criteria should be pluggable — implement a `DelayPolicy` interface with
`shouldDelay(TransactionRequest) -> boolean`, and a default
`ThresholdDelayPolicy` (e.g., delay if amount > ₹10,000, matching RBI's
proposed threshold). This keeps policy separate from mechanism (Open/Closed)
— a future `VelocityDelayPolicy` (too many transactions too fast) can be
added without touching the state machine.

Critically: while a transaction is `PENDING_CONFIRMATION`, the amount must
be **provisionally held** against the credit line's available limit (so the
user can't double-spend the same headroom across two pending transactions),
but not yet counted as `utilized` for billing purposes until `SETTLED`. Model
this with a distinct `heldAmount` field on `CreditLine`, separate from
`utilized` — conflating these is a common real bug.

Apply these principles:
- **SRP:** `SettlementEngine` only manages transaction state transitions and
  limit holds. It does not decide risk (that's Feature 03) and does not
  decide which lender to use (Feature 05) — it receives an already-approved,
  already-routed request.
- **State pattern:** the state machine enforces valid transitions at the
  type/structure level, not through scattered conditionals.
- **Fail closed:** if the scheduler fails to run `expireAndAutoSettle` and a
  transaction sits in `PENDING_CONFIRMATION` past a hard timeout, default
  behavior should be configurable but must default to `CANCELLED`, not
  `SETTLED` — never auto-approve on system failure.

Write test cases: a small transaction settles instantly; a large transaction
enters `PENDING_CONFIRMATION` and correctly holds limit; explicit
cancellation releases the hold without affecting `utilized`; two pending
large transactions against a limited credit line correctly cause the second
to be declined by Feature 03 due to the first one's hold.

## Design Summary

```
enum TxnState { INITIATED, PENDING_CONFIRMATION, SETTLED, CANCELLED, EXPIRED_AUTO_SETTLED }

class TransactionStateMachine {
  transition(txn: Transaction, to: TxnState): Transaction  // validates allowed transitions
}

interface DelayPolicy { shouldDelay(req: TransactionRequest): boolean }

class SettlementEngine {
  constructor(delayPolicy: DelayPolicy, stateMachine: TransactionStateMachine)
  initiateSettlement(req, enforcementResult): Transaction
  confirmSettlement(id): Transaction
  cancelSettlement(id, reason): Transaction
  expireAndAutoSettle(id): Transaction
}
```

## Integration Points
- Receives approved requests from `05-multi-lender-orchestration`.
- Emits `TransactionCreated` (on SETTLED) consumed by `06-unified-billing`.
- Emits `TransactionCancelled` which `03`'s exposure rule can subscribe to
  for updated risk context.
