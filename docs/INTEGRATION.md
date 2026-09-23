# Module Integration

This document describes how the 8 feature modules wire together to process a credit-on-UPI transaction.

## The Transaction Lifecycle
1. **Request**: A standard UPI payload arrives. The API Gateway routes it to the Core Domain `TransactionService`.
2. **Consent (Module 02)**: The `TransactionService` calls `Consent Transparency Layer` to ensure the user has consented to use their credit line for this merchant category.
3. **Risk (Module 01 & 03)**:
   - `Risk Engine (01)` scores the transaction based on UPI behavioral data.
   - `Unified Risk Enforcement (03)` checks prudential norms (e.g., max exposure limits).
4. **Routing (Module 05)**: `Multi-Lender Orchestration` selects the optimal lender to fulfill the request. If the primary lender declines, it routes to a fallback.
5. **Settlement (Module 04)**: `Fraud-Safe Settlement` executes the payment, applying intentional delays for anomalous or large transactions.
6. **Billing (Module 06)**: After settlement, the `Unified Billing` module records the ledger entry.
7. **Growth (Module 07)**: Periodically, the `Limit Growth Engine` analyzes repayment history to offer limit increases.
8. **BNPL (Module 08)**: Post-purchase, the user can use the `BNPL Checkout` API to convert the settled transaction into EMI installments.

## API Contracts
Modules communicate via strictly defined interfaces located in the core domain package. No module should directly instantiate another module's concrete classes.
