# Feature 07 — Limit Growth Engine (Reward Good Repayment Behavior)

## Gap This Fills
Most apps only ever cut a user's limit on default risk signals — none
proactively reward consistent on-time repayment with limit increases. This
is a real retention and trust lever, and it directly addresses the
"thin-file, no credit history" cold-start problem over time: users can prove
themselves through behavior, not just wait for a bureau score to exist.

## Build Prompt

Build a `LimitGrowthEngine` that evaluates a user's repayment history after
each billing cycle and, if eligible, proposes (and can auto-apply, with
transparency) a limit increase — routed back through the Risk Engine's
`reassessUser()`, never by directly mutating `CreditLine.limit`.

Implement `LimitGrowthEngine` with:
- `onRepaymentReceived(RepaymentReceivedEvent)` — event handler subscribed
  to `06-unified-billing`'s `RepaymentReceived` event. Updates a
  `RepaymentStreak` record per user: consecutive on-time repayments,
  consecutive full (not just minimum) repayments, and any late/missed
  repayments (which reset or reduce the streak).
- `evaluateGrowthEligibility(userId) -> GrowthEligibility` — applies rules
  such as: minimum N consecutive on-time repayments, no late payment in the
  last M cycles, utilization consistently below a healthy threshold (e.g.,
  not maxing out the limit every cycle, which can itself be a risk signal).
  Encapsulate these as small `GrowthRule` classes implementing a shared
  `GrowthRule` interface — same Open/Closed pattern as Feature 03's
  `EnforcementRule` — so new growth conditions can be added independently.
- `proposeLimitIncrease(userId) -> LimitProposal` — calls
  `RiskEngine.reassessUser()` (Feature 01) with the updated repayment
  history as an additional signal, rather than computing a new limit with
  separate logic. **This module must never invent its own limit number** —
  it only decides *whether* to trigger a reassessment and *communicates* the
  result.
- `applyLimitIncrease(userId, proposal) -> CreditLine` — actually updates the
  `CreditLine.limit` field, but only through Core Domain's controlled
  mutation method, and only after the user is shown the "why" (which signals
  qualified them) — required for the transparency principle carried from
  Feature 02.

Apply these principles:
- **SRP:** this module decides *eligibility for reassessment* and *applies*
  an approved new limit. It does not compute risk scores itself (Feature 01
  owns that) and does not touch billing data directly (it only reacts to the
  `RepaymentReceived` event, it doesn't query billing state itself) — keeps
  this module loosely coupled and independently testable.
- **OCP:** new growth rules are added as new `GrowthRule` implementations,
  no changes to `evaluateGrowthEligibility`'s core loop.
- **Encapsulation:** `RepaymentStreak` internal counters are only mutated
  through this module's own methods — no other module should ever write to
  a user's streak directly.
- **Transparency by default:** every proposed or applied increase must
  include a human-readable reason ("4 consecutive on-time repayments, low
  utilization") — never a bare number change with no explanation, echoing
  the moto's "consented and reversible" principle even for positive changes.

Write test cases: a user with 4 consecutive on-time full repayments and low
utilization qualifies for growth; a single late repayment resets the streak
and blocks eligibility even if prior history was strong; a user who
consistently maxes out their limit does not qualify despite paying on time
(utilization-health rule catches this); reassessment correctly delegates to
`RiskEngine` rather than computing an independent number.

## Design Summary

```
class RepaymentStreak {
  userId, consecutiveOnTime, consecutiveFullPayment, lastLatePaymentAt
}

interface GrowthRule { evaluate(userId, streak: RepaymentStreak): boolean }

class LimitGrowthEngine {
  constructor(growthRules: List<GrowthRule>, riskEngine: RiskEngine)
  onRepaymentReceived(event): void
  evaluateGrowthEligibility(userId): GrowthEligibility
  proposeLimitIncrease(userId): LimitProposal
  applyLimitIncrease(userId, proposal): CreditLine
}
```

## Integration Points
- Subscribes to `RepaymentReceived` from `06-unified-billing`.
- Calls `01-risk-engine`'s `reassessUser()` — never computes limits itself.
- Applied limit changes are visible through `02-consent-transparency`'s
  utilization display on the next transaction attempt.
