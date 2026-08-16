1. Authentication — "India Stack" Style Login/Signup
Important honesty note (include this understanding in the build)

Real Aadhaar-based eKYC requires UIDAI AUA/KUA licensing that no hackathon project can obtain — so simulate the India Stack flow faithfully rather than claiming real UIDAI integration. This is standard practice for fintech hackathon demos and is what you should build:

Primary login/signup method: mobile number + OTP — this is how every real Indian fintech app (PhonePe, super.money, Paytm) actually authenticates users, and it's the one piece that's realistic to build for real: use Supabase Auth's phone/OTP provider if a SMS provider is configured, otherwise implement a clearly-labeled simulated OTP (generate a 6-digit code, display it in a dev banner or console instead of sending a real SMS, expire it after 5 minutes) — label this on-screen as "Demo mode: OTP shown here" so nobody mistakes it for production behavior.
Simulated PAN + Aadhaar verification step during signup, after phone verification: user enters a PAN number (validate format: [A-Z]{5}[0-9]{4}[A-Z]{1}) and a mock Aadhaar-linked name/DOB. Mark this as kycStatus: SIMULATED_VERIFIED in the data model — do not claim real UIDAI/NSDL verification anywhere in code comments or UI copy.
Session management: real, working sessions (JWT or Supabase session tokens) with proper expiry and refresh — this part should NOT be simulated, since session handling is standard and doesn't require any external regulated integration.
Data model additions
User (extend existing)
  id, phone (unique), phoneVerifiedAt, name, panNumber (hashed/masked in UI),
  kycStatus (UNVERIFIED | SIMULATED_VERIFIED), upiVpa, createdAt

OtpChallenge
  id, phone, codeHash, expiresAt, attempts, verifiedAt, purpose (SIGNUP|LOGIN)

Session
  id, userId, tokenHash, createdAt, expiresAt, revokedAt
Backend endpoints to add
POST /auth/otp/request — accepts phone number, creates an OtpChallenge, rate-limited (max 3 requests per phone per 10 minutes — implement this for real, it's a genuine security requirement, not simulated)
POST /auth/otp/verify — validates code against OtpChallenge, max 5 attempts before the challenge is invalidated and a new one must be requested; on success, creates or logs in the User and issues a session
POST /auth/kyc/simulate-verify — accepts PAN + mock Aadhaar-linked details, sets kycStatus
POST /auth/logout — revokes the session
GET /auth/me — returns current session's user, used by the frontend to gate protected routes
Frontend screens to add
Phone entry screen — single field, "Send OTP" button, real validation (10-digit Indian mobile format)
OTP verification screen — 6-digit input, resend-with-cooldown, real countdown timer tied to expiresAt
KYC simulation screen (signup only) — PAN entry + mock Aadhaar-linked name/DOB fields, clearly labeled as a simulated verification step for demo purposes, styled consistently with the passbook/ledger design system already established (don't introduce a different visual style for auth screens)
Session-aware routing — every existing screen (dashboard, payment, statement, etc.) must check GET /auth/me and redirect to phone-entry if unauthenticated; store session token securely (httpOnly cookie preferred over localStorage, since this is credit/financial data)
Security requirements for this module specifically
Never log OTP codes in plaintext anywhere persistent (console-display for demo purposes is fine, but don't write them to a database or log file unhashed)
Hash OTP codes at rest (codeHash, not code)
Rate-limit both OTP request and OTP verify endpoints — this is the single most commonly-skipped security control in hackathon auth builds and the most important one to actually implement
PAN numbers should be masked in every UI display (ABCDE****F) except during entry
2. Remaining Features to Complete the App

Cross-check against docs/features/*.md and FIGMA_BUILD_PROMPT.md — implement whatever from Modules 1–8 isn't wired up yet. In addition, add:

Notifications
In-app notification feed (not push — out of scope for a demo) for: OTP sent, KYC verified, transaction settled, transaction declined, limit increased, statement generated, payment due reminder. Reuse the "stamp" visual motif from the design system for these — don't introduce generic toast/bell-icon patterns that clash with the established visual language.
Admin / Audit View
A simple screen (can be gated behind a role: ADMIN flag on User, or just a /admin route for demo purposes) showing the AuditLog table — every consent grant/revoke, every transaction state change, every limit change, with actor, timestamp, and reason. This is what makes the demo credible as compliance-aware, not just a UI mockup — prioritize this if time is short, it's a strong differentiator in a judged demo.
Error Handling & Empty States
Every API call on the frontend needs a real loading state, real error state (not a blank screen on failure), and the empty states already specified in the design brief (new user, no transactions yet).
Backend: every endpoint returns structured errors ({ error: { code, message } }), never raw stack traces to the client.
Responsiveness
Must work on mobile viewport widths (most judges will view this on a laptop, but design as mobile-first since it's a UPI-style consumer app — this is a strong signal of production-mindedness).
3. Non-Functional Requirements (apply across everything, not just auth)
SOLID discipline: don't let auth logic leak into payment/billing modules or vice versa — AuthService should be a clean, separately testable module other modules call through a narrow interface (e.g., a getCurrentUser() check), matching the architectural discipline already established in docs/ARCHITECTURE.md.
Fail closed: an unauthenticated or session-expired request to any protected endpoint must return 401, never silently proceed with a default/guest user.
Idempotency: OTP verify and payment endpoints must handle double-submission safely (already specified for payments in the earlier build prompt — apply the same discipline to /auth/otp/verify).
Consistency with existing code: match the existing project's file structure, naming conventions, and API client pattern in src/lib/api.ts — don't introduce a parallel/inconsistent pattern for the new auth code.
4. Acceptance Criteria for This Continuation
 A brand-new user can sign up via phone + OTP, complete simulated KYC, and land on the dashboard — all real, persisted, refreshable
 A returning user can log in via phone + OTP without re-doing KYC
 OTP request is rate-limited and OTP verify has a real attempt limit
 All existing protected screens correctly redirect unauthenticated users to the login flow
 Every credit action from the earlier build (consent, payment, limit growth, etc.) is now correctly attributed to a real authenticated user, not a hardcoded demo user ID
 The admin audit log screen shows a real, growing trail of actions taken during a live walkthrough
 PAN numbers are masked everywhere except entry, and OTP codes are never stored in plaintext
5. Explicitly Out of Scope (say so if asked, don't silently attempt)
Real UIDAI Aadhaar eKYC integration (requires licensing no team has)
Real SMS delivery (unless a Supabase SMS provider is already configured in this project — if unsure, default to the labeled simulated-OTP flow)
Real bank/NBFC API integration (the Lender interface stays mocked, as already specified in the architecture docs)
Content

PDF