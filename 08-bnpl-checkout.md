# Feature 08 — BNPL Checkout Split (Small-Ticket Installments)

## Gap This Fills
super.money acquired BharatX for checkout financing but this is new/unbuilt
in-house — plans call for EMI/BNPL largely for bigger-ticket consumer
durables. We fill a related gap: small-ticket (₹500–₹5,000) BNPL split
**at UPI checkout itself**, reusing the same credit line — no separate BNPL
app or application process needed.

## Build Prompt

Build a `BnplCheckoutService` that lets a user split a UPI-style purchase
into N installments at the moment of payment, using their **existing**
credit line — not a new, separately underwritten loan product. This proves
the platform's core idea: credit infrastructure should be reusable across
product surfaces, not rebuilt per feature.

Implement `BnplCheckoutService` with:
- `getEligiblePlans(userId, creditLineId, amount) -> List<InstallmentPlan>`
  — returns valid split options (e.g., 2, 3, 4 installments) based on the
  amount and the user's current available limit; small amounts below a
  configurable floor (e.g., ₹500) should not offer splitting — return an
  empty list, not a broken 1-installment "plan."
- `createInstallmentSchedule(userId, creditLineId, amount, numInstallments)
  -> InstallmentSchedule` — this is the key design decision: **do not create
  N separate `Transaction` records upfront**. Create ONE transaction for the
  authorization/settlement (goes through the normal `03` → `05` → `04` flow
  exactly like any other spend), and a separate `InstallmentSchedule` object
  that tracks N future line items to be added to upcoming statements. This
  keeps Settlement's job simple (it only ever settles single amounts) while
  Billing (`06`) handles the recurring line-item generation.
- `InstallmentSchedule` should implement the same line-item shape consumed
  by `06-unified-billing`'s `Statement.lineItems`, so BNPL installments
  appear in the same unified bill as regular credit spends — not a separate
  BNPL statement (directly solving the fragmentation gap from Feature 06's
  own problem statement).
- `onInstallmentDue(scheduleId, installmentIndex)` — a scheduler-driven hook
  (simulate with a simple date check, not a real cron) that hands the next
  installment's amount to `BillingEngine` as a new line item at the right
  billing period.
- Missed/late installments should feed back into `07-limit-growth-engine`'s
  streak tracking exactly like a missed full repayment — do not create a
  parallel "BNPL reputation" system; reuse the same repayment-behavior
  signal, since it's the same underlying credit relationship.

Apply these principles:
- **SRP:** this service only decides installment eligibility and schedules
  future line items. It delegates actual authorization to `03`+`05`+`04`
  (the exact same enforcement/routing/settlement pipeline every other
  transaction uses) — **no separate BNPL-specific risk or settlement logic**.
  This is the single most important design decision in this module: BNPL is
  a scheduling wrapper around existing infrastructure, not a parallel system.
- **DRY / reuse over rebuild:** resist the temptation to write a
  `BnplTransaction` class separate from `Transaction` — it should be the
  same `Transaction` type with a reference to its `InstallmentSchedule`.
- **OCP:** supporting merchant-specific installment terms (e.g., 0% interest
  for select partners, mirroring BharatX's 200+ brand partnerships) should be
  handled via a `MerchantInstallmentPolicy` lookup, not conditional logic
  scattered through this service.
- **Fail closed:** if a user's available limit can't cover the full
  installment plan (not just the first installment), the plan must not be
  offered — prevents a user from being approved for installment 1 and
  declined on installment 3 with no warning.

Write test cases: a ₹3,000 purchase offers valid 2/3/4-installment plans; a
₹300 purchase offers no split (below floor); a user with insufficient
*total* limit for all installments is correctly not offered the plan even if
the first installment alone would fit; a missed installment correctly
resets the repayment streak in `07-limit-growth-engine`.

## Design Summary

```
class InstallmentSchedule {
  id, transactionId, creditLineId, userId
  installments: List<{ index, amount, dueDate, status }>
}

interface MerchantInstallmentPolicy { getTerms(merchantId): InstallmentTerms }

class BnplCheckoutService {
  getEligiblePlans(userId, creditLineId, amount): List<InstallmentPlan>
  createInstallmentSchedule(userId, creditLineId, amount, n): InstallmentSchedule
  onInstallmentDue(scheduleId, index): void
}
```

## Integration Points
- Uses `03-unified-risk-enforcement` and `05-multi-lender-orchestration` for
  the single upfront authorization — no separate risk path.
- Uses `04-fraud-safe-settlement` for the one settlement transaction.
- Feeds `06-unified-billing` with recurring line items.
- Feeds missed-installment signals into `07-limit-growth-engine`.
