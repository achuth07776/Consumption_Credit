# Team Moto & Principles

> **"Every class has one job. Every module trusts an interface, not an implementation. Every rupee moved is logged, consented, and reversible until it isn't."**

## Core Commitments
1. **SOLID over clever**: If a class does two things, split it. Maintain single responsibility.
2. **Interfaces before implementations**: `Lender`, `RiskEngine`, and `Settlement` are contracts. Anyone can build behind them without breaking others.
3. **Consent and audit are not optional**: Every credit action must be logged and traceable back to explicit user consent.
4. **Fail closed, not open**: If risk or consent checks cannot be verified, the transaction is declined. Never silently allow it.
5. **Ship your module behind its interface by the deadline**: Integration breaks if you build the whole system instead of your specific slice.
