# Feature 05 — Multi-Lender Orchestration & Fallback

## Gap This Fills
The JD explicitly calls out "ease of integrations between Digital Lending
Apps (DLAs), lenders (Banks & NBFCs) and Loan Service Providers." Today, if a
user's primary lender declines or pauses a limit, the transaction simply
fails — there's no fallback. We fill this by routing across multiple
consented lenders automatically.

## Build Prompt

Build a `LenderOrchestrator` that sits between the risk-approved transaction
and final settlement, responsible for selecting which lender actually funds
a given transaction — including falling back to a secondary lender if the
primary declines, without any new user action required.

First, define the `Lender` interface (owned by Core Domain, consumed here):
`checkEligibility(userId, amount) -> boolean`, `approveTransaction(txnId,
amount) -> LenderDecision`, `getName() -> string`. Implement at least two
concrete lenders for the demo: `BankLender` (simulating e.g. Axis/Utkarsh
SFB) and `NbfcLender` (simulating e.g. DMI Finance) — each with slightly
different mock approval logic, to prove the orchestrator is genuinely
lender-agnostic and not hardcoded to one implementation (Liskov
Substitution: both must be usable wherever `Lender` is expected).

Implement `LenderOrchestrator` with:
- `routeTransaction(TransactionRequest, orderedLenders: List<Lender>) ->
  RoutingResult` — attempts lenders **in priority order** (e.g., user's
  primary linked lender first, then any other consented fallback lenders),
  stopping at the first `APPROVED` decision.
- Each attempt must be logged (`LenderAttemptLog`) with lender name, decision,
  and reason — required for both debugging and the "why was I declined"
  transparency users deserve.
- If **all** lenders decline, return a `RoutingResult.DECLINED` with the
  aggregated reasons — never leave the caller with an ambiguous or partial
  result.

Critically: only attempt a fallback lender if the user has **valid consent**
for that specific lender's credit line too (check via
`02-consent-transparency`'s `ConsentChecker`) — never silently borrow from a
lender the user didn't explicitly consent to, even as a "helpful" fallback.
This is a hard rule, not a suggestion — violating it is a real compliance
issue, not just a bug.

Apply these principles:
- **Strategy Pattern:** each `Lender` implementation is a swappable strategy;
  `LenderOrchestrator` never contains lender-specific conditional logic
  (no `if lenderName == "Axis"` anywhere in this class).
- **OCP:** onboarding a new lender (e.g., adding Yes Bank) means writing a
  new `Lender` implementation and registering it in the user's consented
  lender list — zero changes to `LenderOrchestrator`.
- **DIP:** `LenderOrchestrator` depends on the `Lender` interface and
  `ConsentChecker` interface, injected — never constructs concrete lender
  instances itself.
- **Fail closed:** a lender call that times out or throws must be treated as
  a decline for that lender, then move to fallback — never treated as
  approval by default.

Write test cases: primary lender approves (no fallback needed); primary
declines, secondary approves (fallback works); all lenders decline (clean
aggregated decline); fallback attempted on a lender without valid consent
correctly skips that lender rather than attempting it.

## Design Summary

```
interface Lender {
  checkEligibility(userId, amount): boolean
  approveTransaction(txnId, amount): LenderDecision
  getName(): string
}

class BankLender implements Lender { ... }
class NbfcLender implements Lender { ... }

class LenderOrchestrator {
  constructor(consentChecker: ConsentChecker)
  routeTransaction(req: TransactionRequest, orderedLenders: List<Lender>): RoutingResult
}
```

## Integration Points
- Called after `03-unified-risk-enforcement` approves a request (routing
  only happens for already-risk-approved transactions).
- Hands the final approved+routed request to `04-fraud-safe-settlement`.
- Uses `02-consent-transparency`'s `ConsentChecker` per lender attempt.
