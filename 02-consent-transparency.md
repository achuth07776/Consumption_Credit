# Feature 02 — Consent & Transparency Layer

## Gap This Fills
RBI mandates "explicit consent" before a credit line can be used on UPI, but
in real apps this is a one-time toggle buried in settings, with no ongoing
visibility into whether a payment is "your money" or "borrowed money." Users
get surprised by bills. We fill this with a visible, auditable, per-transaction
consent and mode-transparency system.

## Build Prompt

Build a `ConsentService` module that governs whether and how a user's credit
line can be used, and makes the "own money vs. credit" distinction explicit
at the point of payment — not just in a statement afterward.

Design a `ConsentRecord` value object: `id, userId, creditLineId, scope
(enum: ONE_TIME, STANDING), grantedAt, expiresAt, revokedAt (nullable),
status`. Consent records are **immutable once created** — revoking consent
creates a new state transition, it does not delete or mutate the original
record (needed for audit trail, mirrors real regulatory requirements).

Implement `ConsentService` with these methods:
- `grantConsent(userId, creditLineId, scope, validityDays) -> ConsentRecord`
- `revokeConsent(consentId) -> void` — must cascade: any pending transactions
  relying on this consent should be flagged, not silently allowed to complete
- `isConsentValid(userId, creditLineId) -> boolean` — checked by every module
  that moves credit money, before any debit
- `getActiveConsents(userId) -> List<ConsentRecord>`

This class has **one job**: answering "is this credit usage authorized right
now?" It must never touch `CreditLine.utilized`, never call a lender, never
decide risk. Enforcing SRP here is what lets Settlement, Billing, and Risk
modules all depend on this class safely without circular coupling.

Build the **transparency layer** on top: a `PaymentModeSelector` that, at the
moment of payment, requires the caller to explicitly pass which funding
source is being used (`OWN_MONEY` or `CREDIT_LINE`) — never infer it
silently. If `CREDIT_LINE` is selected, the response to the client must
include: current utilized amount, remaining limit, and this transaction's
contribution to utilization — before the transaction is confirmed. This
directly answers the "users don't realize how much credit they've used"
problem.

Add a `ConsentAuditLog` that every grant/revoke/check event writes to,
capturing actor, timestamp, and outcome. This is what makes the system
defensible under RBI's "prior consent of the individual customer" requirement
— you should be able to prove, for any transaction, exactly which consent
record authorized it.

Apply these principles:
- **Encapsulation:** `ConsentRecord.status` should only be mutated through
  `ConsentService` methods, never set directly from outside.
- **Fail closed:** if `isConsentValid()` throws, times out, or returns
  ambiguous state, treat as **not valid** — never default to allowing the
  transaction.
- **Interface Segregation:** expose a narrow `ConsentChecker` interface
  (just `isConsentValid()`) to modules that only need to check, versus the
  full `ConsentService` for modules that manage the lifecycle. Don't force
  every consumer to depend on grant/revoke methods they'll never call.

Write test cases for: valid standing consent allowing repeated use, one-time
consent that expires after single use, revoked consent blocking a subsequent
transaction attempt, and expired consent being correctly rejected even if
never explicitly revoked.

## Design Summary

```
class ConsentRecord {
  id, userId, creditLineId, scope, grantedAt, expiresAt, revokedAt, status
}

interface ConsentChecker { isConsentValid(userId, creditLineId): boolean }

class ConsentService implements ConsentChecker {
  grantConsent(...): ConsentRecord
  revokeConsent(consentId): void
  isConsentValid(userId, creditLineId): boolean
  getActiveConsents(userId): List<ConsentRecord>
}

class PaymentModeSelector {
  selectMode(userId, txnAmount, mode: OWN_MONEY|CREDIT_LINE): ModeSelection
}
```

## Integration Points
- Called by `03-unified-risk-enforcement` and `05-multi-lender-orchestration`
  before any debit — via the narrow `ConsentChecker` interface.
- Called by client-facing API directly for the transparency display before
  payment confirmation.
