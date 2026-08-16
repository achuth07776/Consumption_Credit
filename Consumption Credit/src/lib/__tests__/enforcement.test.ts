import { describe, it, expect } from "vitest";

// ── Inline enforcement logic ───────────────────────────────────────────────────

interface CreditLine { id: string; limit: number; utilized: number; heldAmount: number; status: "ACTIVE" | "SUSPENDED"; interestRate: number }
interface ConsentRecord { creditLineId: string; status: "ACTIVE" | "REVOKED"; expiresAt: string }
interface RiskResult { tier: string }

type EnforcementRule = (
  cl: CreditLine,
  amount: number,
  consent: ConsentRecord | null,
  risk: RiskResult | null,
) => { approved: boolean; reason: string } | null; // null = pass

const ENFORCEMENT_RULES: EnforcementRule[] = [
  // Rule 1: credit line must be active
  (cl) => cl.status !== "ACTIVE" ? { approved: false, reason: "Credit line suspended" } : null,
  // Rule 2: consent must exist and be active
  (_, _a, consent) =>
    !consent || consent.status !== "ACTIVE"
      ? { approved: false, reason: "Consent not granted" }
      : null,
  // Rule 3: consent must not be expired
  (_, _a, consent) =>
    consent && new Date(consent.expiresAt) < new Date()
      ? { approved: false, reason: "Consent expired" }
      : null,
  // Rule 4: amount must not exceed available limit
  (cl, amount) => {
    const available = cl.limit - cl.utilized - cl.heldAmount;
    return amount > available ? { approved: false, reason: `Insufficient limit. Available: ₹${available}` } : null;
  },
  // Rule 5: risk tier must not be INSUFFICIENT_DATA for large amounts
  (_, amount, _c, risk) =>
    amount > 5000 && risk?.tier === "INSUFFICIENT_DATA"
      ? { approved: false, reason: "Insufficient credit history for this amount" }
      : null,
];

function enforce(
  cl: CreditLine,
  amount: number,
  consent: ConsentRecord | null,
  risk: RiskResult | null,
): { approved: boolean; reason?: string } {
  for (const rule of ENFORCEMENT_RULES) {
    try {
      const result = rule(cl, amount, consent, risk);
      if (result) return result; // first failing rule declines
    } catch {
      // fail closed — a throwing rule declines
      return { approved: false, reason: "Internal check error — declined for safety" };
    }
  }
  return { approved: true };
}

const goodCl: CreditLine = { id: "cl1", limit: 10000, utilized: 0, heldAmount: 0, status: "ACTIVE", interestRate: 0.015 };
const goodConsent: ConsentRecord = { creditLineId: "cl1", status: "ACTIVE", expiresAt: new Date(Date.now() + 86400000).toISOString() };
const goodRisk: RiskResult = { tier: "MEDIUM" };

describe("Enforcement — unified rule engine", () => {
  it("all rules passing → approved", () => {
    const r = enforce(goodCl, 1000, goodConsent, goodRisk);
    expect(r.approved).toBe(true);
  });

  it("suspended credit line → declined", () => {
    const r = enforce({ ...goodCl, status: "SUSPENDED" }, 1000, goodConsent, goodRisk);
    expect(r.approved).toBe(false);
    expect(r.reason).toMatch(/suspended/i);
  });

  it("no consent → declined", () => {
    const r = enforce(goodCl, 1000, null, goodRisk);
    expect(r.approved).toBe(false);
    expect(r.reason).toMatch(/consent/i);
  });

  it("revoked consent → declined", () => {
    const r = enforce(goodCl, 1000, { ...goodConsent, status: "REVOKED" }, goodRisk);
    expect(r.approved).toBe(false);
  });

  it("expired consent → declined", () => {
    const expired: ConsentRecord = { ...goodConsent, expiresAt: new Date(Date.now() - 1000).toISOString() };
    const r = enforce(goodCl, 1000, expired, goodRisk);
    expect(r.approved).toBe(false);
    expect(r.reason).toMatch(/expired/i);
  });

  it("amount exceeds available limit → declined", () => {
    const r = enforce({ ...goodCl, utilized: 9500 }, 1000, goodConsent, goodRisk);
    expect(r.approved).toBe(false);
    expect(r.reason).toMatch(/insufficient/i);
  });

  it("a throwing rule fails closed — never silently approves", () => {
    const throwingRules: EnforcementRule[] = [
      () => { throw new Error("DB timeout") },
    ];
    function enforceWith(rules: EnforcementRule[]) {
      for (const rule of rules) {
        try { const r = rule(goodCl, 1000, goodConsent, goodRisk); if (r) return r; }
        catch { return { approved: false, reason: "Internal check error — declined for safety" }; }
      }
      return { approved: true };
    }
    const r = enforceWith(throwingRules);
    expect(r.approved).toBe(false);
  });
});
