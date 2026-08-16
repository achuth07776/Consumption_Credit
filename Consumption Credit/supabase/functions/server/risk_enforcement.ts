/**
 * Feature 03 — Unified Risk Enforcement (Prudential Norms, Channel-Agnostic)
 *
 * THIS IS THE ONLY PLACE limit/risk rules are enforced.
 * Settlement (Feature 04), BNPL (Feature 08), and every future payment channel
 * MUST call RiskEnforcementGateway.enforce() — never implement their own limit
 * check inline. Violating this discipline defeats the entire point of this
 * module: identical prudential norms regardless of delivery channel.
 *
 * Architecture:
 *   - RiskEnforcementGateway orchestrates rule evaluation (SRP).
 *   - Each EnforcementRule encapsulates one business rule (SRP + OCP).
 *   - The gateway depends on injected EnforcementRule[] and ConsentChecker (DIP).
 *   - Any rule exception → DECLINED, never skipped (fail-closed).
 *   - Result is always APPROVED or DECLINED — never partial/ambiguous.
 */

// ── Channel type ──────────────────────────────────────────────────────────────

/** All delivery channels that can consume a credit line. */
export type TxChannel = "UPI" | "BNPL" | "CARD";

// ── Domain view types ─────────────────────────────────────────────────────────

/**
 * The subset of a CreditLine that enforcement rules need.
 * Keeping this a separate type means rules never accidentally mutate live state.
 *
 * allowedChannels: optional lender-imposed channel restriction.
 * Absent or empty → all channels permitted (backward-compatible with existing
 * CreditLine records that predate this field).
 */
export interface CreditLineView {
  id: string;
  userId: string;
  limit: number;
  utilized: number;
  heldAmount: number;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  allowedChannels?: TxChannel[];
}

// ── Request / Result contracts ────────────────────────────────────────────────

/** Every credit-consuming transaction is described by this request. */
export interface TransactionRequest {
  userId: string;
  creditLineId: string;
  /** Transaction amount in INR (paisa-free, whole rupees). */
  amount: number;
  /** Delivery channel that originated this transaction. */
  channel: TxChannel;
  /**
   * Merchant identifier. Maps to merchantName in the existing Transaction
   * type — used by ExposureConcentrationRule to detect per-merchant concentration.
   */
  merchantId: string;
}

/** Result of a single rule evaluation. */
export type RuleResult =
  | { outcome: "PASS" }
  | { outcome: "FAIL"; reason: string };

/** Final gateway decision — binary, never partial. */
export type EnforcementResult =
  | { status: "APPROVED" }
  | { status: "DECLINED"; reason: string };

// ── EnforcementRule interface ─────────────────────────────────────────────────

/**
 * Contract every enforcement rule must satisfy.
 *
 * Open/Closed Principle: add a new rule by implementing this interface and
 * registering it in the gateway's rule list — zero changes to
 * RiskEnforcementGateway.enforce().
 *
 * evaluate() may return RuleResult synchronously (e.g., LimitCheckRule,
 * CreditLineStatusRule) or as a Promise (e.g., ConsentRule,
 * ExposureConcentrationRule which perform async lookups). The gateway
 * handles both via await.
 */
export interface EnforcementRule {
  readonly name: string;
  evaluate(req: TransactionRequest, line: CreditLineView): RuleResult | Promise<RuleResult>;
}

// ── ConsentChecker interface ──────────────────────────────────────────────────

/**
 * Narrow interface from Feature 02 — Consent & Transparency Layer.
 *
 * ConsentRule depends on this interface, not on the full ConsentService.
 * This follows Interface Segregation: rules that only check consent should
 * not be coupled to grant/revoke lifecycle methods they'll never call.
 *
 * The implementing class (ConsentService) lives in Feature 02.
 * The /enforce route wires a KV-backed adapter closure to this interface.
 */
export interface ConsentChecker {
  isConsentValid(userId: string, creditLineId: string): Promise<boolean>;
}

// ── Rule 1: LimitCheckRule ────────────────────────────────────────────────────

/**
 * Ensures utilized + heldAmount + requested amount does not exceed
 * the sanctioned credit limit.
 *
 * available = limit − utilized − heldAmount
 * PASS  if amount ≤ available
 * FAIL  otherwise
 */
export class LimitCheckRule implements EnforcementRule {
  readonly name = "LimitCheckRule";

  evaluate(req: TransactionRequest, line: CreditLineView): RuleResult {
    const available = line.limit - line.utilized - line.heldAmount;
    if (req.amount <= available) {
      return { outcome: "PASS" };
    }
    return {
      outcome: "FAIL",
      reason: `Limit reached for this cycle. Available: ₹${available.toLocaleString("en-IN")}. Repay early to free up room.`,
    };
  }
}

// ── Rule 2: ConsentRule ───────────────────────────────────────────────────────

/**
 * Delegates consent validation to the ConsentChecker interface from
 * Feature 02 — never reimplements consent logic here.
 *
 * Avoiding duplicate source-of-truth is the explicit design intent:
 * consent logic lives in Feature 02 and nowhere else.
 *
 * Fail-closed: if ConsentChecker throws or returns false, result is FAIL.
 */
export class ConsentRule implements EnforcementRule {
  readonly name = "ConsentRule";

  constructor(private readonly consentChecker: ConsentChecker) {}

  async evaluate(req: TransactionRequest, _line: CreditLineView): Promise<RuleResult> {
    const valid = await this.consentChecker.isConsentValid(req.userId, req.creditLineId);
    if (valid) {
      return { outcome: "PASS" };
    }
    return {
      outcome: "FAIL",
      reason: "No valid consent for this credit line. Please grant consent before transacting.",
    };
  }
}

// ── Rule 3: CreditLineStatusRule ──────────────────────────────────────────────

/**
 * Ensures the credit line is ACTIVE before allowing any spend.
 * SUSPENDED or CLOSED lines must not be usable regardless of channel.
 */
export class CreditLineStatusRule implements EnforcementRule {
  readonly name = "CreditLineStatusRule";

  evaluate(_req: TransactionRequest, line: CreditLineView): RuleResult {
    if (line.status === "ACTIVE") {
      return { outcome: "PASS" };
    }
    return {
      outcome: "FAIL",
      reason: `Credit line is ${line.status}. Contact support to reactivate.`,
    };
  }
}

// ── Rule 4: ExposureConcentrationRule ─────────────────────────────────────────

/** Configuration for ExposureConcentrationRule — injected, not hardcoded. */
export interface ExposureConcentrationConfig {
  /**
   * Window (in days) over which to measure per-merchant spend.
   * Default: 30 days.
   */
  windowDays: number;
  /**
   * Maximum fraction (0–1) of the sanctioned limit that can be used at a
   * single merchant within the window.
   * Default: 0.7 (70%).
   */
  maxMerchantFraction: number;
}

const DEFAULT_EXPOSURE_CONFIG: ExposureConcentrationConfig = {
  windowDays: 30,
  maxMerchantFraction: 0.7,
};

/** Shape of a historical transaction needed by the exposure rule. */
export interface HistoricalTransaction {
  merchantId: string;
  amount: number;
  createdAt: string; // ISO-8601
}

/**
 * Flags if a disproportionate share of the sanctioned limit would be consumed
 * at a single merchant within the configured rolling window.
 *
 * This implements the basic prudential-norm-style guardrail required by
 * Feature 03: exposure concentration monitoring, channel-agnostic.
 *
 * The transaction history source is injected (DIP), keeping this rule
 * independently testable without any KV or DB dependency.
 */
export class ExposureConcentrationRule implements EnforcementRule {
  readonly name = "ExposureConcentrationRule";

  constructor(
    private readonly getRecentTransactions: (
      userId: string,
      windowDays: number,
    ) => Promise<HistoricalTransaction[]>,
    private readonly config: ExposureConcentrationConfig = DEFAULT_EXPOSURE_CONFIG,
  ) {}

  async evaluate(req: TransactionRequest, line: CreditLineView): Promise<RuleResult> {
    const txs = await this.getRecentTransactions(req.userId, this.config.windowDays);

    // Sum existing spend at this merchant in the window
    const existingAtMerchant = txs
      .filter((t) => t.merchantId === req.merchantId)
      .reduce((sum, t) => sum + t.amount, 0);

    const projectedAtMerchant = existingAtMerchant + req.amount;
    const concentrationFraction = projectedAtMerchant / line.limit;

    if (concentrationFraction <= this.config.maxMerchantFraction) {
      return { outcome: "PASS" };
    }

    const thresholdAmount = Math.floor(line.limit * this.config.maxMerchantFraction);
    return {
      outcome: "FAIL",
      reason:
        `Exposure concentration limit reached for merchant "${req.merchantId}". ` +
        `Projected spend ₹${projectedAtMerchant.toLocaleString("en-IN")} would exceed ` +
        `${Math.round(this.config.maxMerchantFraction * 100)}% of your limit ` +
        `(₹${thresholdAmount.toLocaleString("en-IN")}) within ${this.config.windowDays} days.`,
    };
  }
}

// ── Rule 5: ChannelEligibilityRule ────────────────────────────────────────────

/**
 * Enforces lender-imposed channel restrictions on a credit line.
 *
 * Some lenders issue lines that are UPI-only or BNPL-only per their product
 * terms. allowedChannels on CreditLineView captures this scoping.
 *
 * If allowedChannels is absent or empty, all channels are permitted
 * (backward-compatible: existing credit lines without this field can be
 * used on any channel, matching current behaviour).
 */
export class ChannelEligibilityRule implements EnforcementRule {
  readonly name = "ChannelEligibilityRule";

  evaluate(req: TransactionRequest, line: CreditLineView): RuleResult {
    const allowed = line.allowedChannels;

    // No restriction configured → all channels permitted
    if (!allowed || allowed.length === 0) {
      return { outcome: "PASS" };
    }

    if (allowed.includes(req.channel)) {
      return { outcome: "PASS" };
    }

    return {
      outcome: "FAIL",
      reason:
        `Channel "${req.channel}" is not permitted for this credit line. ` +
        `Allowed channels: ${allowed.join(", ")}.`,
    };
  }
}

// ── RiskEnforcementGateway ────────────────────────────────────────────────────

/**
 * The single gate every credit-consuming transaction must pass through.
 *
 * Responsibilities (SRP — gateway only):
 *   1. Resolve the CreditLineView for the requested credit line.
 *   2. Evaluate every registered EnforcementRule in order.
 *   3. Return APPROVED only if all rules pass; DECLINED with the first
 *      failing reason otherwise.
 *   4. Treat any rule exception as DECLINED (fail-closed).
 *
 * What the gateway does NOT do (business logic lives in rules):
 *   - Never decides limit arithmetic itself.
 *   - Never calls KV or DB directly — getCreditLine is injected.
 *   - Never constructs rule instances internally (DIP).
 *
 * OCP: registering a new rule (e.g., a future RBI cooling-off rule) requires
 * only adding a new EnforcementRule implementation and passing it in the
 * rules array — zero changes to this class.
 */
export class RiskEnforcementGateway {
  constructor(
    private readonly rules: EnforcementRule[],
    private readonly getCreditLine: (creditLineId: string) => Promise<CreditLineView | null>,
  ) {}

  /**
   * Evaluate all registered rules against the transaction request.
   *
   * @returns APPROVED if all rules pass, DECLINED with the first failure reason
   *          (or an internal error reason if rule evaluation throws).
   */
  async enforce(req: TransactionRequest): Promise<EnforcementResult> {
    // Resolve the credit line — fail closed if not found
    let line: CreditLineView | null;
    try {
      line = await this.getCreditLine(req.creditLineId);
    } catch {
      return { status: "DECLINED", reason: "Unable to retrieve credit line. Transaction declined." };
    }

    if (!line) {
      return { status: "DECLINED", reason: "Credit line not found." };
    }

    if (line.userId !== req.userId) {
      return { status: "DECLINED", reason: "Credit line does not belong to this user." };
    }

    // Evaluate every rule — return at first failure (fail-fast within the gate)
    for (const rule of this.rules) {
      let result: RuleResult;
      try {
        // Rules may be sync or async — await handles both
        result = await rule.evaluate(req, line);
      } catch (err) {
        // Fail closed: an unexpected rule error is treated as a DECLINED
        const message = err instanceof Error ? err.message : String(err);
        return {
          status: "DECLINED",
          reason: `Rule "${rule.name}" failed with an unexpected error: ${message}`,
        };
      }

      if (result.outcome === "FAIL") {
        return { status: "DECLINED", reason: result.reason };
      }
    }

    return { status: "APPROVED" };
  }
}

// ── Factory helper ────────────────────────────────────────────────────────────

/**
 * Builds the canonical rule set for the platform.
 *
 * This is the registered order:
 *   1. CreditLineStatusRule  — fast exit for SUSPENDED / CLOSED lines
 *   2. LimitCheckRule        — fast exit for over-limit requests
 *   3. ConsentRule           — async KV read
 *   4. ExposureConcentrationRule — async KV read + windowed aggregation
 *   5. ChannelEligibilityRule    — sync lookup
 *
 * Inject this array into RiskEnforcementGateway at the call site.
 */
export function buildDefaultRules(
  consentChecker: ConsentChecker,
  getRecentTransactions: (userId: string, windowDays: number) => Promise<HistoricalTransaction[]>,
  exposureConfig?: Partial<ExposureConcentrationConfig>,
): EnforcementRule[] {
  return [
    new CreditLineStatusRule(),
    new LimitCheckRule(),
    new ConsentRule(consentChecker),
    new ExposureConcentrationRule(getRecentTransactions, {
      ...DEFAULT_EXPOSURE_CONFIG,
      ...exposureConfig,
    }),
    new ChannelEligibilityRule(),
  ];
}
