# Feature 03 — Unified Risk Enforcement (Prudential Norms, Channel-Agnostic)

## Gap This Fills
RBI ruled (June 2026) that credit lines on UPI must follow the **same
prudential norms as the underlying loan product, regardless of delivery
channel**. Most apps built payment logic and lending-risk logic as separate
silos — a limit check enforced for card spends isn't reliably enforced for
UPI spends. We fill this by making risk/limit enforcement a single shared
gate every payment channel must pass through.

## Build Prompt

Build a `RiskEnforcementGateway` that sits in front of every credit-consuming
transaction, regardless of whether it originated from UPI-style payment,
BNPL checkout, or a future card-present flow. Its job: guarantee that limit,
exposure, and eligibility rules are applied **identically** across channels.

Design the gateway with a single entry method:
`enforce(TransactionRequest) -> EnforcementResult`, where
`TransactionRequest` includes `userId, creditLineId, amount, channel (enum:
UPI, BNPL, CARD), merchantId`. `EnforcementResult` is either `APPROVED` or
`DECLINED(reason)` — never a partial/ambiguous state.

The gateway must run these checks, each as its own small `EnforcementRule`
class implementing a shared `EnforcementRule` interface with `evaluate
(TransactionRequest, CreditLine) -> RuleResult`, so channel-specific rules
can be added later without rewriting the gateway (Open/Closed Principle):

1. `LimitCheckRule` — utilized + amount must not exceed sanctioned limit
2. `ConsentRule` — delegates to `02-consent-transparency`'s `ConsentChecker`
   interface; does not reimplement consent logic here (avoid duplicate
   source of truth — a classic real-world bug)
3. `CreditLineStatusRule` — line must be `ACTIVE`, not `SUSPENDED`/`CLOSED`
4. `ExposureConcentrationRule` — flags if a disproportionate share of the
   limit is being used on a single merchant/category in a short window
   (basic prudential-norm-style guardrail)
5. `ChannelEligibilityRule` — some credit lines may be UPI-only or
   BNPL-only per lender terms; this rule enforces that scoping

Run all rules; if **any** rule returns a failure, the whole request is
`DECLINED` with the first failing reason — do not partially apply a
transaction. This is the core of "prudential norms applied irrespective of
delivery mode": one gate, same rules, every channel.

Apply these principles:
- **SRP:** the gateway orchestrates rule evaluation; it does not itself
  decide business logic for any single rule — that lives in the rule classes.
- **OCP:** a 6th rule (e.g., a future RBI-mandated cooling-off rule) is added
  by writing a new `EnforcementRule` implementation and registering it — zero
  changes to `RiskEnforcementGateway.enforce()`.
- **DIP:** the gateway depends on `List<EnforcementRule>` and
  `ConsentChecker` interfaces injected at construction, never instantiates
  concrete rule classes internally.
- **Fail closed:** any rule that throws an exception during evaluation
  should be treated as a `DECLINED`, not skipped.

This module is the **only** place limit/risk rules are enforced. Settlement,
BNPL, and any future payment channel must call this gateway — never
implement their own limit check. Document this clearly in code comments,
since enforcing this discipline across 9 people building in parallel is the
actual point of this module.

Write test cases proving: a UPI transaction and a BNPL transaction of
identical amount against the same credit line are evaluated by the exact
same rule set and produce consistent outcomes; a transaction that fails only
the exposure-concentration rule is declined even if limit and consent are
fine; a rule throwing an unexpected error results in decline, not silent pass.

## Design Summary

```
interface EnforcementRule {
  evaluate(req: TransactionRequest, line: CreditLine): RuleResult
}

class RiskEnforcementGateway {
  constructor(rules: List<EnforcementRule>, consentChecker: ConsentChecker)
  enforce(req: TransactionRequest): EnforcementResult
}
```

## Integration Points
- Called first by `05-multi-lender-orchestration` before routing to a lender.
- Depends on `02-consent-transparency` (via `ConsentChecker` interface) and
  `01-risk-engine` (for limit values already assigned to the `CreditLine`).
- Called by `08-bnpl-checkout` for each installment authorization, proving
  channel-agnostic enforcement.
