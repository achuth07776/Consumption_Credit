# Feature 03: Unified Risk Enforcement

## Overview
Enforces RBI prudential norms across all credit products (e.g., cooling-off periods, maximum exposure).

## Class Design
- `PrudentialRule` (Interface): `Result evaluate(Transaction context)`
- `MaxExposureRule`: Ensures total drawn credit doesn't exceed regulatory limits.
- `CoolingOffRule`: Enforces time gaps between subsequent large credit drawdowns.
- `EnforcementEngine`: Runs all rules synchronously.

## Build Prompt
Implement the `Unified Risk Enforcement` module.
1. Define the `PrudentialRule` interface returning a Pass/Fail `Result`.
2. Implement `MaxExposureRule` to calculate the user's current outstanding balance across all lenders and ensure the new transaction doesn't breach the RBI limit.
3. Implement `CoolingOffRule` to reject transactions if a previous large drawdown occurred within a configurable window (e.g., 24 hours).
4. Build the `EnforcementEngine` to chain these rules. It must execute quickly in the synchronous payment flow.
5. Log all rule evaluations. A failure here is an absolute block, regardless of lender willingness.
