# Feature 01 — Thin-File Risk & Scoring Engine

## Gap This Fills
super.money's CEO has publicly stated ~60% of their new cardholders are
first-time borrowers with no credit bureau history. Every existing app either
rejects thin-file users or hands them a token ₹500 limit with no growth path.
We fill this by scoring users on **UPI behavioral signals** instead of a
bureau score.

## Build Prompt (for whoever builds this module, or an AI pair-programmer)

Build a `RiskEngine` module for a UPI-linked consumption credit platform. The
engine must assign an initial credit limit to a user who has **no traditional
credit bureau score**, using only UPI transaction history as a proxy signal.

Design a `RiskEngine` interface with a single primary method,
`assessUser(UserProfile) -> RiskAssessment`, where `RiskAssessment` contains
a recommended limit, a risk tier (LOW/MEDIUM/HIGH), and a list of the signals
that drove the decision (for auditability — never return a black-box score).

Implement a `UpiBehaviorScorer` class implementing `RiskEngine`. It should
compute a weighted score from at least these signals, each as its own small
class or function implementing a shared `RiskSignal` interface with a
`compute(UserProfile) -> float` method, so new signals can be added later
without touching the scorer's core logic (Open/Closed Principle):

1. `TransactionFrequencySignal` — how regularly the user transacts on UPI
2. `AverageTicketSizeSignal` — average transaction value, capped to avoid
   outliers skewing the score
3. `MerchantDiversitySignal` — number of distinct merchant categories used
   (proxy for stable spending behavior vs. one-off/erratic use)
4. `BillPaymentRegularitySignal` — recurring bill payments via UPI (rent,
   utilities) as a proxy for financial discipline
5. `AccountAgeSignal` — how long the UPI account/VPA has been active

Each signal returns a normalized 0–1 score. The scorer combines them with
configurable weights (do not hardcode weights inline — put them in a
`ScoringConfig` object so they can be tuned without code changes).

Map the final composite score to:
- 0.0–0.3 → HIGH risk → limit capped at ₹1,000–₹5,000 or declined
- 0.3–0.7 → MEDIUM risk → limit ₹5,000–₹25,000
- 0.7–1.0 → LOW risk → limit ₹25,000–₹1,00,000

Apply SOLID principles strictly:
- **SRP:** `RiskEngine` only decides limits. It never touches `CreditLine`
  state directly, never calls a lender API, never checks consent — it returns
  a decision, and the caller (Unified Risk Enforcement module) acts on it.
- **OCP:** Adding a 6th signal (e.g., a new "AA OCEN" account-aggregator
  signal down the line) should require zero changes to `UpiBehaviorScorer`'s
  existing code — only a new `RiskSignal` implementation and a config entry.
- **DIP:** `UpiBehaviorScorer` depends on `List<RiskSignal>` injected via
  constructor, not hardcoded instantiations.

Also implement `reassessUser()` — called by the Limit Growth Engine (Feature
07) when a user has a strong repayment streak. This must reuse the same
signal pipeline plus a new `RepaymentHistorySignal`, not a separate parallel
scoring path — one scoring engine, multiple entry points.

Write at least 3 test cases: a thin-file user with strong UPI bill-payment
regularity (should get a reasonable limit despite no bureau score), a
high-frequency low-diversity user (should be MEDIUM, not automatically LOW),
and a near-dormant account (should be HIGH risk / declined).

Include input validation: reject or flag users with insufficient transaction
history (e.g., account age < 30 days) rather than silently assigning a
default limit — this must be an explicit `INSUFFICIENT_DATA` outcome, not a
guess.

Log every assessment with the signals and their individual contributions —
required for RBI-style auditability and for debugging scoring disputes.

## Design Summary

```
interface RiskSignal { compute(UserProfile p): float }  // 0..1
interface RiskEngine  { assessUser(UserProfile p): RiskAssessment }

class UpiBehaviorScorer implements RiskEngine {
  constructor(signals: List<RiskSignal>, config: ScoringConfig)
  assessUser(p): RiskAssessment
  reassessUser(p, repaymentHistory): RiskAssessment
}

class RiskAssessment {
  recommendedLimit: number
  tier: LOW | MEDIUM | HIGH | INSUFFICIENT_DATA
  contributingSignals: Map<string, float>
}
```

## Integration Points
- Consumed by `03-unified-risk-enforcement` at credit-line creation time.
- Consumed by `07-limit-growth-engine` via `reassessUser()`.
- Never calls into Settlement, Consent, or Billing — one-directional
  dependency, keeps this module independently testable.
