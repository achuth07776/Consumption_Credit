# System Architecture — ConsumptionCredit

## 1. High-Level Design

```
                        ┌─────────────────────────┐
                        │      Client / UI         │
                        │  (Payment + Dashboard)   │
                        └────────────┬─────────────┘
                                     │
                        ┌────────────▼─────────────┐
                        │      API Gateway Layer     │
                        │  (auth, request routing)   │
                        └────────────┬─────────────┘
                                     │
       ┌────────────────┬───────────┼───────────┬────────────────┐
       ▼                ▼           ▼           ▼                ▼
┌─────────────┐  ┌─────────────┐ ┌─────────┐ ┌───────────┐ ┌───────────┐
│  Consent &   │  │  Risk Engine │ │ Lender  │ │ Settlement │ │  Billing  │
│ Transparency │  │ (thin-file)  │ │ Orches- │ │  Engine    │ │  Engine   │
│    Layer     │  │              │ │ trator  │ │ (fraud-    │ │ (unified) │
└──────┬───────┘  └──────┬───────┘ └────┬────┘ │  safe)     │ └─────┬─────┘
       │                 │              │      └─────┬──────┘       │
       └────────┬────────┴──────┬───────┴────────────┴───────┬──────┘
                ▼                ▼                            ▼
        ┌───────────────────────────────────────────────────────┐
        │              Core Domain Layer (shared)                 │
        │  User | CreditLine | Lender | Merchant | Transaction    │
        └───────────────────────────┬───────────────────────────┘
                                    ▼
                        ┌───────────────────────┐
                        │   Persistence Layer     │
                        │ (DB / in-memory store)  │
                        └───────────────────────┘
```

Two more modules plug in horizontally, not vertically:
- **Limit Growth Engine** — reads Billing + Transaction history, writes updated
  limits back to `CreditLine` via the Risk Engine's interface.
- **BNPL Checkout Split** — sits on top of Settlement + Billing, reuses the same
  `CreditLine`, doesn't create a parallel credit system.

## 2. Core Domain Layer (built first, by Core Domain Lead)

These are the shared contracts every other module depends on. **Nobody else
builds these — they only implement/consume them.**

```
User            — id, kycStatus, linkedCreditLines[], upiVpa
Merchant        — id, name, category, mdrApplicable
Lender          — interface: checkEligibility(), sanctionLimit(), approveTxn()
CreditLine      — id, lenderId, userId, limit, utilized, status, interestRate
Transaction     — id, creditLineId, merchantId, amount, status, timestamp, mode
ConsentRecord   — id, userId, creditLineId, scope, grantedAt, expiresAt
```

**OOP principles applied here:**
- `Lender` is an **interface/abstract class** — Axis Bank, Utkarsh SFB, DMI
  Finance are concrete implementations (`BankLender`, `NBFCLender`).
  This is the **Strategy Pattern** + **Liskov Substitution** — any lender can
  be swapped without breaking the orchestrator.
- `CreditLine` never exposes its raw `utilized` field for direct mutation —
  only through `debit()` / `credit()` methods that enforce limit checks
  (**Encapsulation**).
- `Transaction` is immutable once created (**Value Object pattern**) — status
  changes create a new state transition record, not a field overwrite. This
  gives us a natural audit trail.

## 3. SOLID Principles — how each is enforced project-wide

- **S — Single Responsibility:** Risk scoring, consent, settlement, and
  billing are separate modules/classes. No class both scores risk AND moves
  money.
- **O — Open/Closed:** New lenders, new risk signals, new payment modes are
  added by implementing an interface (`Lender`, `RiskSignal`), never by
  editing existing classes.
- **L — Liskov Substitution:** Any `Lender` implementation must be usable
  wherever `Lender` is expected — no lender-specific `if/else` in the
  orchestrator.
- **I — Interface Segregation:** `Lender` doesn't force NBFCs to implement
  bank-only methods (e.g., `overdraftLink()`) — split into smaller interfaces
  if a lender type doesn't need a capability.
- **D — Dependency Inversion:** `SettlementEngine` and `RiskEngine` depend on
  the `Lender` interface, never on a concrete `AxisLender` class directly —
  inject the dependency.

## 4. Security & Compliance (non-negotiable for every module)

1. **Fail closed:** if consent, risk, or limit checks can't complete, the
   transaction is declined, never approved by default.
2. **Consent before capability:** no module calls `CreditLine.debit()` without
   a valid, unexpired `ConsentRecord` — enforced at the Core Domain layer, not
   left to each feature module to remember.
3. **Every credit action is logged** with actor, timestamp, and reason —
   required for the "prudential norms" unified enforcement (Feature 03).
4. **No plaintext sensitive data** — mock PAN/Aadhaar fields are hashed even
   in this demo, to build the habit.
5. **Idempotency keys** on every transaction-creating endpoint — prevents
   double-debits on retry, a real fraud vector.

## 5. How Modules Communicate

- All modules talk to Core Domain objects **only through their public methods**
  — never reach into another module's internal state.
- Use an **event-driven backbone** where possible: `TransactionCreated`,
  `ConsentGranted`, `LimitBreached`, `RepaymentReceived` — Billing, Limit
  Growth, and Fraud modules subscribe to these instead of being directly
  called by Settlement. This decouples modules so 9 people can build in
  parallel without merge conflicts.
- If event-driven is too much for the timeline, fall back to a shared
  `TransactionRepository` interface everyone reads/writes through — still
  decoupled, simpler to ship by morning.

## 6. Build Order (tonight, for a 9-person team)

1. **Hour 0–1:** Core Domain Lead ships `User`, `Lender`, `CreditLine`,
   `Merchant`, `Transaction`, `ConsentRecord` interfaces. Push immediately —
   everyone else is blocked until this lands.
2. **Hour 1–5:** All 8 feature owners build against the interfaces, using
   mocked/in-memory data where their dependency isn't ready yet.
3. **Hour 5–6:** Integration pass — wire modules together per
   `/docs/INTEGRATION.md`.
4. **Hour 6–7:** End-to-end test: link credit line → spend → risk check →
   consent check → settlement → billing → repayment → limit growth.
5. **Last hour:** Polish, README, demo script.

See `/docs/features/*.md` for each module's detailed build prompt.
