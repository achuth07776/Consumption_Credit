# Feature 01: Risk Engine (Thin-File Scoring)

## Overview
Evaluates credit risk based on UPI behavioral data rather than traditional bureau scores.

## Class Design
- `RiskScorer` (Interface): `Score evaluate(User user, Transaction txn)`
- `UPIBehaviorScorer` (Implementation): Analyzes past UPI transactions.
- `MerchantCategoryScorer` (Implementation): Flags high-risk MCCs (e.g., gambling).
- `AggregateRiskEngine`: Combines multiple scorers.

## Build Prompt
Implement the `Risk Engine` module.
1. Create the `RiskScorer` interface.
2. Implement `UPIBehaviorScorer` which accepts a user's transaction history and calculates a risk score (0-100). Frequent low-value, diverse merchant transactions = lower risk.
3. Implement `MerchantCategoryScorer` to penalize risky MCCs.
4. Create an `AggregateRiskEngine` that takes a list of `RiskScorer`s and returns a combined score. If the score exceeds a configurable threshold, the transaction should be marked `HIGH_RISK`.
5. Ensure all evaluations are logged for auditability.
6. Must fail closed: if history is unavailable but required, reject the transaction.
