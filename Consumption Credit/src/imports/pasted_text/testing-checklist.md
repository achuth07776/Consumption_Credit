1. Cold Start / Deployment Check
 Confirm the app is reachable via a live URL, not only localhost — if it's only running locally, deploy it now (Figma Make's built-in deploy, or whatever hosting this project is configured for) and confirm the deployed version has the same behavior as local.
 Load the deployed URL in a fresh, fully logged-out browser/incognito session. Confirm it correctly lands on the phone-entry login screen — not a broken blank page, not a cached dashboard from a prior session.
 Confirm environment variables/secrets (Supabase keys etc.) are correctly configured in the deployed environment, not only in local .env — a common last-mile deploy failure.
2. Full Auth Journey (new user)
 Enter a fresh phone number → request OTP → confirm the demo-mode OTP is actually visible/retrievable (banner, console, wherever it's surfaced) → enter it correctly → succeeds.
 Enter the wrong OTP 5 times → confirm the challenge is invalidated and a new OTP must be requested, not silently allowed on a 6th try.
 Request OTP 4 times in under 10 minutes → confirm the 4th request is correctly rate-limited with a clear message, not a silent failure.
 Complete the PAN/KYC simulation step with a validly-formatted PAN → confirm kycStatus updates and PAN is masked (ABCDE****F) on every subsequent screen it appears on, including the new KFS and grievance screens added in the last round.
 Log out, log back in with the same phone number → confirm KYC does NOT need to be redone, and prior transaction history/statements are still there (real persistence, not session-only state).
3. Credit Line Onboarding + KFS + Cooling-Off
 Link a credit line → confirm the Key Fact Statement is shown and is not skippable before consent is granted → confirm the APR shown is a real computed number matching the credit line's configured interest rate, not a placeholder.
 Grant consent → confirm coolingOffExpiresAt is set and the "Exit within cooling-off period" banner is visible on the dashboard.
 Attempt the cooling-off exit → confirm it correctly calculates principal + proportionate APR only (no penalty) and actually closes the credit line.
 On a second test user, let the cooling-off window pass (use the existing "advance day" demo control) → confirm the exit option correctly disappears/is blocked after coolingOffExpiresAt.
4. Risk Engine — Real Differentiation Check
 Run risk assessment on at least 3 of the 5 seeded demo users with different transaction histories → confirm they genuinely produce different tiers/limits (not all defaulting to the same MEDIUM tier) → confirm the signal breakdown shown is specific to that user, not identical boilerplate across users.
5. Payment Flow — Every Branch
 Small payment (under ₹10,000), own-money mode → settles instantly, no credit line touched.
 Small payment, credit-line mode → confirm the interest preview shows a real ₹ figure before confirming, and settles instantly after.
 Large payment (over ₹10,000), credit-line mode → confirm it enters PENDING_CONFIRMATION with a real countdown, not a static label.
 Cancel a pending payment → confirm heldAmount is released and available limit is correctly restored on the dashboard.
 Let a pending payment expire (use demo time-advance control) → confirm it auto-settles correctly.
 Double-tap the same payment submission quickly → confirm only ONE transaction is created (idempotency actually working, not just unit-tested in isolation).
 Force a primary-lender decline (use whatever demo condition triggers it, e.g., amount above that lender's mock threshold) → confirm it correctly falls back to the secondary lender and the attempt log shows both tries.
6. Billing, Repayment, Autopay
 Close a billing period with transactions across two different lenders → confirm the unified statement shows both correctly with accurate totals.
 Make a partial repayment → confirm allocation across lenders happens as designed, and the statement reflects it immediately.
 Set an Autopay mandate (Full or Minimum) → close the next period → confirm repayment actually triggers automatically without manual action, and the statement/dashboard reflect it.
 Download the statement PDF → confirm it renders correctly, visually matches the app's ledger design, and the numbers match what's shown on screen.
7. Limit Growth — Consent Required (the compliance fix)
 Simulate 4+ consecutive on-time full repayments for one demo user → confirm a LimitProposal is created but CreditLine.limit does not change yet.
 Confirm the proposal appears as an actionable notification ("Accept" / "Not now"), not a passive announcement.
 Tap "Not now" → confirm the limit genuinely stays unchanged.
 Tap "Accept" on a fresh proposal → confirm the limit updates AND a new ConsentRecord is created for that specific increase.
8. BNPL Checkout Split
 Attempt a small purchase (under the split floor, e.g. ₹300) → confirm no split option is offered.
 Attempt a mid-size purchase → confirm 2/3/4-installment previews show correct per-installment amounts.
 Complete a split purchase → confirm future installment line items correctly appear on later statement periods, not all at once.
 Use the demo controls to simulate a missed installment → confirm it correctly resets the repayment streak used by the Limit Growth Engine.
9. Grievance & Admin
 Raise a grievance as a regular user → confirm it appears under "my tickets."
 Switch to an admin-role user (or the admin route) → confirm the ticket appears in the all-tickets list and can be marked resolved → confirm the status change reflects back on the original user's view.
 Confirm the Nodal Officer contact card is visible and correctly labeled as demo contact info.
10. Spending Insights
 View the insights screen for a demo user with varied transaction history → confirm category breakdowns are computed from real transaction data (spot-check the numbers by hand against the raw transaction list) rather than looking suspiciously round/placeholder.
11. Language Toggle
 Switch to Hindi on the dashboard → click through payment, statement, and KFS screens → confirm text switches correctly and layout doesn't break (no overflow/truncation issues from longer Hindi strings) → confirm money amounts stay in consistent ₹ / en-IN formatting regardless of language, as specified.
 Switch back to English → confirm it round-trips cleanly with no leftover mixed-language text anywhere.
12. Audit Log — Cross-Cutting Check
 After completing the scenarios above, open the admin audit log → confirm it shows a real, chronological trail covering: consent grants, the limit proposal + accept, the cooling-off exit, OTP verifications, and payment state transitions — not just some of these action types. If any module isn't writing to the audit log, fix it now — this was a Round 3 requirement that's easy to silently miss when adding Round 4 features on top.
13. Cross-Module Consistency Pass
 Confirm every new screen from the last round (KFS, cooling-off banner, grievance, insights, autopay toggle, PDF, language switch) visually matches the established design system exactly — Fraunces for money, Public Sans for UI, 4px radius, ruled lines, stamp motif. Flag and fix anything that looks like a bolted-on generic component.
 Confirm every protected screen correctly redirects to login if the session is expired/invalid — test by manually clearing the session token and reloading a deep link (e.g., directly navigating to the statement screen).
 Confirm mobile viewport (375px width) rendering for at least: login, dashboard, payment, KFS, statement, grievance, insights.
Final Deliverable

After running through all sections above:

Fix every issue found — don't just report them.
Re-run npx tsc --noEmit and the full test suite to confirm nothing broke while fixing issues.
Produce a short pass/fail table against Sections 1–13 above.
Confirm the deployed URL is live and reflects all fixes.

This is the pass that determines whether the demo actually works live, not just whether the code compiles and unit tests pass — treat it as the most important prompt in this whole build sequence.

Content

PDF