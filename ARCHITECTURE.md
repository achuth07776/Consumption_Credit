# Consumption Credit Architecture

## System Overview
The Consumption Credit platform is a backend-first, API-driven system acting as the credit orchestration layer behind a UPI-style payment. It connects pre-sanctioned credit lines from banks/NBFCs to users' UPI Virtual Payment Addresses (VPAs).

## Core Entities
1. **User**: The consumer interacting with the system.
2. **Merchant**: The entity receiving the payment.
3. **CreditLine**: The pre-sanctioned credit from a lender.
4. **Transaction**: The payment attempt, subject to risk, consent, and settlement.
5. **Lender**: The bank or NBFC providing the credit line.

## Module Boundaries and Data Flow
1. **Transaction Initiation**: User attempts a payment.
2. **Risk & Consent Check**: `RiskEngine` evaluates thin-file data. `ConsentLayer` verifies user agreement.
3. **Multi-Lender Routing**: If primary lender declines, `MultiLenderOrchestration` routes to a fallback.
4. **Risk Enforcement**: `UnifiedRiskEnforcement` ensures RBI prudential norms are met.
5. **Settlement**: `FraudSafeSettlement` processes the transfer (or delays if high risk).
6. **Post-Transaction**: `UnifiedBilling` updates the statement, and `LimitGrowthEngine` assesses limit increases. `BNPLCheckout` allows conversion to installments.

## Design Principles
- **Interfaces over Implementations**: Core logic depends on abstractions (e.g., `ILender`, `IRiskScorer`).
- **Auditability**: Every transaction state change must be logged.
- **Fail Closed**: Any failure in risk or consent results in a declined transaction.
