# Feature 08: BNPL Checkout Split

## Overview
Allows users to convert a settled credit-on-UPI transaction into structured EMI installments.

## Class Design
- `EmiCalculator`: Calculates monthly payments given principal, rate, and tenure.
- `TransactionConverter`: Converts a standard transaction into a BNPL loan.
- `EmiScheduleManager`: Generates and tracks the schedule of payments.

## Build Prompt
Implement the `BNPL Checkout Split` module.
1. Build `EmiCalculator` to generate precise monthly installment amounts, handling rounding differences for the final month.
2. Implement `TransactionConverter`. It accepts a previously `SETTLED` transaction (e.g., > 3000 INR) and user consent to convert it to a 3, 6, or 9-month EMI.
3. Create `EmiScheduleManager` to write future dues into the `LedgerService` (from Feature 06).
4. Ensure a transaction can only be converted once, and within 15 days of the original purchase.
5. Throw exceptions for ineligible transactions.
