# Feature 02: Consent & Transparency Layer

## Overview
Ensures every credit action is logged and traceable back to explicit user consent.

## Class Design
- `ConsentManager` (Interface): `boolean verifyConsent(User user, Action action)`
- `ConsentLedger`: Immutable log of granted/revoked consents.
- `ConsentValidator`: Middleware that checks consent before any credit deduction.

## Build Prompt
Implement the `Consent & Transparency Layer`.
1. Define the `ConsentManager` interface.
2. Build an append-only `ConsentLedger` that records when a user agrees to T&Cs for a credit line, or consents to a specific transaction. Include timestamps and device fingerprints.
3. Implement `ConsentValidator` which intercepts transaction requests. It must verify that the user has an active, unrevoked consent record for the specific lender and merchant category.
4. If consent is missing, throw a `ConsentRequiredException` with details needed for the frontend to prompt the user.
5. Provide APIs to grant and revoke consent.
