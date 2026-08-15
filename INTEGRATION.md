# Integration Guide — How the 8 Modules Wire Together

This is the map every module owner should check before writing their final
integration code. Read this alongside `/ARCHITECTURE.md`.

## End-to-End Flow (what "done" looks like in the demo)

1. **User links a credit line** → `02-consent-transparency` captures explicit
   consent → `ConsentRecord` created → Core Domain `CreditLine` created in
   `PENDING` state.
2. **Risk Engine scores the user** (`01-risk-engine`) using UPI transaction
   history proxy signals → returns a limit recommendation → `CreditLine`
   moves to `ACTIVE` with an assigned limit.
3. **User attempts a UPI-style spend** → request hits
   `03-unified-risk-enforcement` first (checks limit + prudential norms,
   channel-agnostic) → then `02-consent-transparency` (valid consent? which
   mode — own money or credit?) → then `05-multi-lender-orchestration`
   (route to the linked lender; fall back to a secondary lender if declined).
4. **If the transaction is large**, `04-fraud-safe-settlement` intercepts
   before final commit — applies the pending/delay window, allows user
   cancellation.
5. **On success**, `Transaction` is committed in Core Domain → emits
   `TransactionCreated` event.
6. **06-unified-billing** subscribes to `TransactionCreated`, aggregates into
   the user's single statement across all credit products.
7. **On repayment**, `06-unified-billing` emits `RepaymentReceived` →
   `07-limit-growth-engine` subscribes, evaluates repayment streak, and (if
   eligible) requests a limit increase back through `01-risk-engine`'s
   interface — never mutates `CreditLine.limit` directly.
8. **08-bnpl-checkout** is a special transaction type: it calls the same path
   as step 3–4, but creates an installment schedule instead of a single debit,
   handed to `06-unified-billing` as N future line items.

## Dependency Graph (who must be ready before whom)

```
Core Domain (Hour 0-1)
   │
   ├── 02 Consent & Transparency        (no dependency beyond Core Domain)
   ├── 01 Risk Engine                   (no dependency beyond Core Domain)
   │
   ├── 03 Unified Risk Enforcement  ──depends on──▶ 01, 02
   ├── 05 Multi-Lender Orchestration──depends on──▶ 03
   ├── 04 Fraud-Safe Settlement     ──depends on──▶ 05
   │
   ├── 06 Unified Billing           ──depends on──▶ 04 (via TransactionCreated event)
   ├── 07 Limit Growth Engine       ──depends on──▶ 06, 01
   └── 08 BNPL Checkout Split       ──depends on──▶ 04, 06
```

**Practical implication:** Members on 01 and 02 have zero blockers — start
immediately using mocked Core Domain if it's not pushed yet. Members on 06,
07, 08 should build against mocked upstream interfaces for the first few
hours, and only wire to real implementations at the integration hour.

## Shared Contracts Everyone Must Respect

- `Lender` interface — never call a concrete lender class directly outside
  `05-multi-lender-orchestration`.
- `ConsentRecord` — every debit-type operation must check this first. If your
  module moves money without checking consent, that's a bug, not a shortcut.
- `TransactionCreated`, `RepaymentReceived`, `LimitBreached` — treat these as
  the only cross-module communication channel where possible, to avoid tight
  coupling between modules built by different people.

## Integration Hour Checklist

- [ ] All 8 modules compile/run against the real Core Domain (not mocks)
- [ ] End-to-end flow (steps 1–8 above) runs without manual patching
- [ ] Every module's audit log shows up in one place (even if just console/log file)
- [ ] Declined-transaction paths tested, not just happy paths
- [ ] One team member does a full run-through as if demoing to super.money
