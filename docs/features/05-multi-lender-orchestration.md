# Feature 05: Multi-Lender Orchestration & Fallback

## Overview
Routes the credit request across multiple pre-sanctioned lenders if the primary one declines or is down.

## Class Design
- `LenderGateway` (Interface): `LenderResponse authorize(Transaction txn)`
- `Orchestrator`: Manages the fallback logic.
- `LenderPreferenceService`: Determines the order of lenders to try.

## Build Prompt
Implement the `Multi-Lender Orchestration` module.
1. Define the `LenderGateway` interface.
2. Create dummy implementations for `BankALender` and `NBFCBLender` with mock decline rates/timeouts.
3. Implement the `Orchestrator`. It should receive a transaction, fetch the user's available credit lines via `LenderPreferenceService`, and attempt authorization.
4. If `BankALender` times out or declines due to insufficient individual limit, automatically fallback to `NBFCBLender` in the same synchronous flow.
5. The overall response time must be tracked, and if all lenders fail, return a unified decline reason.
