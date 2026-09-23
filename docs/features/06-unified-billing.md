# Feature 06: Unified Billing & Repayment

## Overview
Generates a single, consolidated bill for the user across all underlying credit products and lenders.

## Class Design
- `LedgerService`: Records debits (spends) and credits (repayments).
- `StatementGenerator`: Aggregates ledger entries into a monthly bill.
- `RepaymentRouter`: Splits a user's single repayment back to multiple lenders.

## Build Prompt
Implement the `Unified Billing & Repayment` module.
1. Build `LedgerService` with double-entry accounting principles to track outstanding balances per user, per lender.
2. Implement `StatementGenerator` which runs on a billing cycle (e.g., 1st of the month) and aggregates all unpaid transactions across all lenders into a single `Statement` object.
3. Implement `RepaymentRouter`. When a user makes a 10,000 INR repayment against a 15,000 INR consolidated bill, write logic to allocate the funds proportionally or based on highest-interest-first to the underlying lenders.
4. Ensure all ledger entries are immutable.
