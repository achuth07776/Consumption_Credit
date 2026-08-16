/**
 * Feature 03 — Unified Risk Enforcement: Unit Tests
 *
 * Run with: deno test supabase/functions/server/risk_enforcement.test.ts
 *
 * Test coverage:
 *  1. Happy path — all rules pass → APPROVED
 *  2. Channel parity — UPI and BNPL execute the EXACT SAME rule set
 *  3. Exposure concentration fails even when limit and consent are fine
 *  4. Rule throws → fail closed (DECLINED, not skipped)
 *  5. LimitCheckRule — amount exceeds available limit → DECLINED
 *  6. ConsentRule — ConsentChecker returns false → DECLINED
 *  7. CreditLineStatusRule — SUSPENDED line → DECLINED
 *  8. CreditLineStatusRule — CLOSED line → DECLINED  (new)
 *  9. ChannelEligibilityRule — channel not in allowedChannels → DECLINED
 * 10. Gateway guards — not found, user mismatch
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDefaultRules,
  ChannelEligibilityRule,
  ConsentChecker,
  ConsentRule,
  CreditLineStatusRule,
  CreditLineView,
  EnforcementRule,
  ExposureConcentrationRule,
  HistoricalTransaction,
  LimitCheckRule,
  RiskEnforcementGateway,
  RuleResult,
  TransactionRequest,
} from "./risk_enforcement.ts";

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeLine(overrides?: Partial<CreditLineView>): CreditLineView {
  return {
    id: "cl_test",
    userId: "u_test",
    limit: 30000,
    utilized: 5000,
    heldAmount: 0,
    status: "ACTIVE" as CreditLineView["status"],
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<TransactionRequest>): TransactionRequest {
  return {
    userId: "u_test",
    creditLineId: "cl_test",
    amount: 1000,
    channel: "UPI",
    merchantId: "swiggy",
    ...overrides,
  };
}

/** ConsentChecker that always returns the provided value. */
function fakeConsent(valid: boolean): ConsentChecker {
  return {
    isConsentValid: async (_userId: string, _creditLineId: string) => valid,
  };
}

/** ConsentChecker that throws to simulate a backend failure. */
function brokenConsent(): ConsentChecker {
  return {
    isConsentValid: async () => {
      throw new Error("Consent service unavailable");
    },
  };
}


/** Builds a gateway wired with the full default rule set. */
function makeGateway(
  line: CreditLineView,
  consentValid: boolean,
  history: HistoricalTransaction[] = [],
): RiskEnforcementGateway {
  const rules = buildDefaultRules(
    fakeConsent(consentValid),
    async (_userId: string, _days: number) => history,
  );
  return new RiskEnforcementGateway(rules, async (_id: string) => line);
}

// ── Test 1: Happy path ────────────────────────────────────────────────────────

Deno.test("Happy path — all rules pass → APPROVED", async () => {
  const gateway = makeGateway(makeLine(), true);
  const result = await gateway.enforce(makeRequest());
  assertEquals(result.status, "APPROVED");
});

// ── Test 2: Channel parity ────────────────────────────────────────────────────
//
// The requirement: a UPI transaction and a BNPL transaction of identical amount
// against the same credit line are evaluated by the EXACT SAME rule set.
// We prove this by instrumenting a spy rule that records every channel it sees,
// then asserting both channels triggered every registered rule in the same order.

Deno.test(
  "Channel parity — UPI and BNPL execute the exact same rule set in the same order",
  async () => {
    // ── Spy rule: records which channel each evaluate() call saw ─────────────
    const executionLog: { ruleName: string; channel: string }[] = [];

    function makeSpy(name: string): EnforcementRule {
      return {
        name,
        evaluate(req: TransactionRequest, _line: CreditLineView): RuleResult {
          executionLog.push({ ruleName: name, channel: req.channel });
          return { outcome: "PASS" };
        },
      };
    }

    // Construct the same five named spies that mirror the default rule set order
    const spyRuleNames = [
      "CreditLineStatusRule",
      "LimitCheckRule",
      "ConsentRule",
      "ExposureConcentrationRule",
      "ChannelEligibilityRule",
    ];
    const spyRules = spyRuleNames.map(makeSpy);

    const line = makeLine(); // ACTIVE, ₹25,000 available, no channel restrictions
    const gateway = new RiskEnforcementGateway(spyRules, async () => line);

    // ── Run UPI, then BNPL ──────────────────────────────────────────────────
    const upiResult = await gateway.enforce(makeRequest({ channel: "UPI", amount: 2000 }));
    const bnplResult = await gateway.enforce(makeRequest({ channel: "BNPL", amount: 2000 }));

    // Both approved
    assertEquals(upiResult.status, "APPROVED", "UPI should be approved");
    assertEquals(bnplResult.status, "APPROVED", "BNPL should be approved");

    // ── Split the log into per-channel slices ─────────────────────────────
    const upiLog = executionLog.filter((e) => e.channel === "UPI");
    const bnplLog = executionLog.filter((e) => e.channel === "BNPL");

    // Each channel must have triggered every rule exactly once
    assertEquals(
      upiLog.length,
      spyRuleNames.length,
      `UPI should execute all ${spyRuleNames.length} rules`,
    );
    assertEquals(
      bnplLog.length,
      spyRuleNames.length,
      `BNPL should execute all ${spyRuleNames.length} rules`,
    );

    // The rule names executed for UPI and BNPL must be identical and in the same order
    const upiRuleNames = upiLog.map((e) => e.ruleName);
    const bnplRuleNames = bnplLog.map((e) => e.ruleName);
    assertEquals(
      upiRuleNames,
      bnplRuleNames,
      "UPI and BNPL must execute the exact same rule set in the same order — gateway is channel-agnostic",
    );

    // Explicitly confirm the canonical order
    assertEquals(
      upiRuleNames,
      spyRuleNames,
      "Rules must execute in canonical order: Status → Limit → Consent → Exposure → Channel",
    );
  },
);

// ── Test 3: Exposure concentration fails even when limit and consent are fine ─

Deno.test(
  "Exposure concentration — fails even when limit and consent pass",
  async () => {
    // Line has ₹25,000 available — plenty of room
    const line = makeLine({ limit: 30000, utilized: 5000 });

    // But ₹22,000 already spent at this merchant in the last 30 days
    // Adding ₹2,000 more → ₹24,000 = 80% of ₹30,000 limit → exceeds 70% threshold
    const priorHistory: HistoricalTransaction[] = [
      { merchantId: "amazon", amount: 22000, createdAt: new Date().toISOString() },
    ];

    const rules = buildDefaultRules(
      fakeConsent(true),
      async () => priorHistory,
      { maxMerchantFraction: 0.7 },
    );
    const gateway = new RiskEnforcementGateway(rules, async () => line);

    const result = await gateway.enforce(
      makeRequest({ amount: 2000, merchantId: "amazon" }),
    );

    assertEquals(result.status, "DECLINED");
    if (result.status === "DECLINED") {
      assertEquals(result.reason.includes("concentration"), true);
    }
  },
);

// ── Test 4: Rule throws → fail closed ────────────────────────────────────────

Deno.test(
  "Fail closed — a rule that throws results in DECLINED, not silent pass",
  async () => {
    const throwingRule: EnforcementRule = {
      name: "ExplodingRule",
      evaluate(_req: TransactionRequest, _line: CreditLineView): RuleResult | Promise<RuleResult> {
        throw new Error("Simulated unexpected rule failure");
      },
    };

    const gateway = new RiskEnforcementGateway(
      [new CreditLineStatusRule(), throwingRule],
      async () => makeLine(),
    );

    const result = await gateway.enforce(makeRequest());
    assertEquals(result.status, "DECLINED");
    if (result.status === "DECLINED") {
      assertEquals(result.reason.includes("ExplodingRule"), true);
    }
  },
);

// ── Test 5: LimitCheckRule — amount exceeds available ────────────────────────

Deno.test(
  "LimitCheckRule — amount exceeding available limit → DECLINED",
  async () => {
    // available = 30000 − 5000 − 0 = 25000; requesting 26000
    const line = makeLine({ limit: 30000, utilized: 5000, heldAmount: 0 });
    const rule = new LimitCheckRule();

    const result = rule.evaluate(makeRequest({ amount: 26000 }), line);
    assertEquals(result.outcome, "FAIL");
  },
);

Deno.test(
  "LimitCheckRule — amount exactly equal to available → PASS",
  async () => {
    const line = makeLine({ limit: 30000, utilized: 5000, heldAmount: 0 });
    const rule = new LimitCheckRule();

    const result = rule.evaluate(makeRequest({ amount: 25000 }), line);
    assertEquals(result.outcome, "PASS");
  },
);

// ── Test 6: ConsentRule — ConsentChecker returns false ───────────────────────

Deno.test(
  "ConsentRule — ConsentChecker returns false → DECLINED",
  async () => {
    const rule = new ConsentRule(fakeConsent(false));
    const result = await rule.evaluate(makeRequest(), makeLine());
    assertEquals(result.outcome, "FAIL");
  },
);

Deno.test(
  "ConsentRule — ConsentChecker throws → FAIL (fail-closed via gateway)",
  async () => {
    // Test that the gateway wraps the thrown error correctly
    const rules = [new ConsentRule(brokenConsent())];
    const gateway = new RiskEnforcementGateway(rules, async () => makeLine());

    const result = await gateway.enforce(makeRequest());
    assertEquals(result.status, "DECLINED");
    if (result.status === "DECLINED") {
      assertEquals(result.reason.includes("ConsentRule"), true);
    }
  },
);

// ── Test 7: CreditLineStatusRule — SUSPENDED line ────────────────────────────

Deno.test(
  "CreditLineStatusRule — SUSPENDED credit line → DECLINED",
  async () => {
    const line = makeLine({ status: "SUSPENDED" });
    const gateway = makeGateway(line, true);

    const result = await gateway.enforce(makeRequest());
    assertEquals(result.status, "DECLINED");
    if (result.status === "DECLINED") {
      assertEquals(result.reason.includes("SUSPENDED"), true);
    }
  },
);

Deno.test(
  "CreditLineStatusRule — ACTIVE credit line → PASS",
  async () => {
    const rule = new CreditLineStatusRule();
    const result = rule.evaluate(makeRequest(), makeLine({ status: "ACTIVE" }));
    assertEquals(result.outcome, "PASS");
  },
);

Deno.test(
  "CreditLineStatusRule — CLOSED credit line → DECLINED",
  async () => {
    const line = makeLine({ status: "CLOSED" });
    const gateway = makeGateway(line, true);

    const result = await gateway.enforce(makeRequest());
    assertEquals(result.status, "DECLINED");
    if (result.status === "DECLINED") {
      assertEquals(
        result.reason.includes("CLOSED"),
        true,
        `Expected reason to mention CLOSED, got: "${result.reason}"`,
      );
    }
  },
);

// ── Test 8: ChannelEligibilityRule ────────────────────────────────────────────

Deno.test(
  "ChannelEligibilityRule — BNPL request on UPI-only credit line → DECLINED",
  async () => {
    const line = makeLine({ allowedChannels: ["UPI"] });
    const rule = new ChannelEligibilityRule();

    const result = rule.evaluate(makeRequest({ channel: "BNPL" }), line);
    assertEquals(result.outcome, "FAIL");
    if (result.outcome === "FAIL") {
      assertEquals(result.reason.includes("BNPL"), true);
      assertEquals(result.reason.includes("UPI"), true);
    }
  },
);

Deno.test(
  "ChannelEligibilityRule — UPI request on UPI-only line → PASS",
  async () => {
    const line = makeLine({ allowedChannels: ["UPI"] });
    const rule = new ChannelEligibilityRule();

    const result = rule.evaluate(makeRequest({ channel: "UPI" }), line);
    assertEquals(result.outcome, "PASS");
  },
);

Deno.test(
  "ChannelEligibilityRule — no allowedChannels set → all channels permitted",
  async () => {
    const line = makeLine({ allowedChannels: undefined });
    const rule = new ChannelEligibilityRule();

    const upi = rule.evaluate(makeRequest({ channel: "UPI" }), line);
    const bnpl = rule.evaluate(makeRequest({ channel: "BNPL" }), line);
    const card = rule.evaluate(makeRequest({ channel: "CARD" }), line);

    assertEquals(upi.outcome, "PASS");
    assertEquals(bnpl.outcome, "PASS");
    assertEquals(card.outcome, "PASS");
  },
);

// ── Test: Credit line not found → DECLINED ────────────────────────────────────

Deno.test(
  "Gateway — credit line not found → DECLINED (fail-closed)",
  async () => {
    const gateway = new RiskEnforcementGateway(
      [new CreditLineStatusRule()],
      async () => null, // line not found
    );

    const result = await gateway.enforce(makeRequest());
    assertEquals(result.status, "DECLINED");
    if (result.status === "DECLINED") {
      assertEquals(result.reason.includes("not found"), true);
    }
  },
);

// ── Test: Credit line user mismatch → DECLINED ────────────────────────────────

Deno.test(
  "Gateway — credit line userId mismatch → DECLINED",
  async () => {
    const line = makeLine({ userId: "u_other" }); // different user
    const gateway = new RiskEnforcementGateway([], async () => line);

    const result = await gateway.enforce(makeRequest({ userId: "u_test" }));
    assertEquals(result.status, "DECLINED");
    if (result.status === "DECLINED") {
      assertEquals(result.reason.includes("does not belong"), true);
    }
  },
);
