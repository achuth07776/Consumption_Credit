# Team Moto & Working Principles

## The Moto

> **"Every class has one job. Every module trusts an interface, not an
> implementation. Every rupee moved is logged, consented, and reversible
> until it isn't."**

## Why This Matters for a 9-Person, Overnight Build

We have no time for merge conflicts caused by two people editing the same
class, and no time to debug "who broke the CreditLine model" at 4 AM. The
only way 9 people ship a coherent system by tomorrow morning is:

1. **One person owns Core Domain. Everyone else only consumes it.**
   If you need a new field or method on `CreditLine`, `User`, or `Lender` —
   ask the Core Domain owner to add it. Do not edit shared models yourself.

2. **Build against the interface, not the final implementation.**
   If your dependency (e.g., Risk Engine) isn't ready, mock it:
   `class MockRiskEngine implements RiskEngine`. Swap it out at integration
   time. This is what lets 8 people work in parallel without blocking.

3. **Every feature module is independently testable.**
   You should be able to demo your module's logic with a small script or
   test file, without the full system running.

4. **Fail closed, always.**
   If you're unsure whether a check passed, treat it as failed. A declined
   transaction is recoverable. An unauthorized one is not.

5. **Push early, push often.**
   Commit your interface/class skeletons within the first hour, even empty.
   This unblocks everyone downstream of you.

6. **No feature is "done" without a design note.**
   Each feature file in `/docs/features/` has a design section — update it if
   your implementation diverges from the plan, so integration doesn't break.

## Communication Rules

- Blocked for more than 15 minutes? Post it immediately — don't silently wait.
- Changing a shared interface? Announce it before pushing, not after.
- Integration hour is not optional — everyone must be reachable then.

## Definition of Done (per feature)

- [ ] Core classes implemented against the shared interfaces
- [ ] At least one working example / test demonstrating the flow
- [ ] SOLID violations self-reviewed (no class doing two jobs)
- [ ] Consent/risk/audit hooks wired in, not skipped "for now"
- [ ] Design section in your feature file updated to match final code
