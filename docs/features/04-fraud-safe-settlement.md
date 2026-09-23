# Feature 04: Fraud-Safe Settlement

## Overview
Handles the actual movement of funds, applying intentional delays to large or anomalous transactions to prevent fraud.

## Class Design
- `SettlementGateway` (Interface): `SettlementStatus process(Transaction txn)`
- `InstantSettler`: Moves funds immediately for trusted/low-value txns.
- `DelayedSettler`: Places funds in escrow/pending state for high-value txns.
- `FraudDelayRouter`: Decides which settler to use based on risk score.

## Build Prompt
Implement the `Fraud-Safe Settlement` module.
1. Create the `SettlementGateway` interface.
2. Implement `InstantSettler` which mocks API calls to the bank to move funds immediately.
3. Implement `DelayedSettler` which records the transaction as `PENDING_SETTLEMENT` and requires a scheduled job or manual admin approval to finalize.
4. Build `FraudDelayRouter` which takes the output of the `Risk Engine` (Feature 01). If the risk is LOW, route to `InstantSettler`. If HIGH but acceptable, route to `DelayedSettler`.
5. Ensure transaction states are strictly managed (e.g., `INITIATED` -> `SETTLED` or `DELAYED`).
