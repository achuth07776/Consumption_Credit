# Consumption Credit — super.money SDE1 Project

## 🎯 Core Idea

We are building **ConsumptionCredit**, a simulated "Credit Line on UPI" platform —
the same category of product super.money, PhonePe, and Kotak811 are racing to
build. The core bet: **credit should feel as instant, transparent, and frictionless
as a UPI payment — while staying fully compliant with RBI's prudential norms.**

We are NOT building a payments app. We are building the **credit orchestration
layer** that sits behind a UPI-style payment: risk scoring, consent, multi-lender
routing, billing, and fraud-safe settlement — the parts every real fintech in this
space struggles with.

## 🧭 What We Are Building

A backend-first, API-driven system simulating:

1. A user linking a **pre-sanctioned credit line** from a bank/NBFC to a UPI-style VPA
2. Spending that credit line at a merchant, exactly like a UPI payment
3. Getting **assessed for credit** using UPI behavior, not a bureau score (thin-file problem)
4. Getting **routed across multiple lenders** if one declines
5. Seeing **one unified bill** across all credit products
6. Getting **fraud-safe delays** on large transactions
7. Earning **limit increases** through good repayment behavior
8. Splitting **checkout purchases** into BNPL installments using the same credit line

Every feature maps to a real, documented gap in super.money / PhonePe / RBI's current
rules — not a generic wallet app. See `/docs/features/` for the gap → feature mapping.

## 🧑‍🤝‍🧑 Team Moto

> **"Every class has one job. Every module trusts an interface, not an
> implementation. Every rupee moved is logged, consented, and reversible until
> it isn't."**

Concretely, everyone on the team commits to:

- **SOLID over clever.** If a class does two things, split it.
- **Interfaces before implementations.** `Lender`, `RiskEngine`, `Settlement`
  are contracts — anyone can build behind them without breaking others.
- **Consent and audit are not optional add-ons.** Every credit action is logged
  and traceable back to explicit user consent.
- **Fail closed, not open.** If risk/consent checks can't be verified, the
  transaction is declined — never silently allowed.
- **Ship your module behind its interface by the deadline** — integration
  breaks if you build the whole system instead of your slice.

## 📁 Repo Structure

```
/ARCHITECTURE.md              — system-wide design, module boundaries, data flow
/docs/TEAM_MOTO.md            — principles + how modules communicate
/docs/INTEGRATION.md          — how all 8 feature modules wire together
/docs/features/
  01-risk-engine.md
  02-consent-transparency.md
  03-unified-risk-enforcement.md
  04-fraud-safe-settlement.md
  05-multi-lender-orchestration.md
  06-unified-billing.md
  07-limit-growth-engine.md
  08-bnpl-checkout.md
```

## 👥 Suggested Team Split (9 members)

| # | Owner | Module |
|---|-------|--------|
| 1 | Core Domain Lead | `CreditLine`, `User`, `Merchant`, `Transaction` base models |
| 2 | Member A | Risk Engine (thin-file scoring) |
| 3 | Member B | Consent & Transparency Layer |
| 4 | Member C | Unified Risk Enforcement (prudential norms) |
| 5 | Member D | Fraud-Safe Settlement (delayed large txns) |
| 6 | Member E | Multi-Lender Orchestration & Fallback |
| 7 | Member F | Unified Billing & Repayment |
| 8 | Member G | Limit Growth Engine |
| 9 | Member H | BNPL Checkout Split + Integration/API layer |

Each member reads `/ARCHITECTURE.md` first, then their own file in
`/docs/features/`, which contains a full ~100-line build prompt + class design.
