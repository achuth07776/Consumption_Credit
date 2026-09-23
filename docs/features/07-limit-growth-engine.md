# Feature 07: Limit Growth Engine

## Overview
Analyzes user repayment behavior to automatically offer or provision credit limit increases.

## Class Design
- `LimitEvaluator` (Interface): `boolean isEligibleForIncrease(User user)`
- `RepaymentHistoryAnalyzer`: Checks for on-time payments.
- `UtilizationAnalyzer`: Checks if the user is consistently using their limit safely.
- `LimitIncreaseService`: Provisions the new limit if eligible.

## Build Prompt
Implement the `Limit Growth Engine` module.
1. Define the `LimitEvaluator` interface.
2. Implement `RepaymentHistoryAnalyzer` to check the last 6 months of the user's billing statements. If all were paid on time, return true.
3. Implement `UtilizationAnalyzer`. If the user utilizes >50% of their limit but never defaults, they are a good candidate for an increase.
4. Build `LimitIncreaseService` which runs as a scheduled batch job. It queries all users, runs them through the evaluators, and if eligible, automatically increments their `CreditLine` limit by 20%.
5. Log all limit increases for audit.
