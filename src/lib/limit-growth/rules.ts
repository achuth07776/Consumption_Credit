/**
 * Growth Rules Implementations
 * SOLID Open/Closed Principle: Add new rules without modifying existing code
 */

import type { GrowthRule, RepaymentStreak } from "./types";

// ── Rule 1: Consecutive On-Time Repayments ──────────────────────────────────
export class ConsecutiveOnTimeRule implements GrowthRule {
  name = "Consecutive On-Time Repayments";
  description = "User has made N consecutive on-time repayments";
  
  constructor(private minConsecutive: number = 4) {}

  async evaluate(userId: string, streak: RepaymentStreak) {
    const passed = streak.consecutiveOnTime >= this.minConsecutive;
    return {
      passed,
      reason: passed
        ? `✓ ${streak.consecutiveOnTime} consecutive on-time repayments (threshold: ${this.minConsecutive})`
        : `✗ Only ${streak.consecutiveOnTime} consecutive on-time repayments (need: ${this.minConsecutive})`,
      score: Math.min((streak.consecutiveOnTime / this.minConsecutive) * 100, 100),
    };
  }
}

// ── Rule 2: Full Payment Bonus ──────────────────────────────────────────────
export class FullPaymentBonusRule implements GrowthRule {
  name = "Full Payment Bonus";
  description = "User has made multiple full (not minimum) repayments";
  
  constructor(private minFullPayments: number = 2) {}

  async evaluate(userId: string, streak: RepaymentStreak) {
    const passed = streak.consecutiveFullPayment >= this.minFullPayments;
    return {
      passed,
      reason: passed
        ? `✓ ${streak.consecutiveFullPayment} consecutive full repayments (threshold: ${this.minFullPayments})`
        : `✗ Only ${streak.consecutiveFullPayment} full repayments (need: ${this.minFullPayments})`,
      score: Math.min((streak.consecutiveFullPayment / this.minFullPayments) * 100, 100),
    };
  }
}

// ── Rule 3: No Recent Late Payments ─────────────────────────────────────────
export class NoRecentLateRule implements GrowthRule {
  name = "No Recent Late Payments";
  description = "User has not made a late payment recently";
  
  constructor(private daysThreshold: number = 90) {}

  async evaluate(userId: string, streak: RepaymentStreak) {
    if (!streak.lastLateAt) {
      return {
        passed: true,
        reason: "✓ No late payments on record",
        score: 100,
      };
    }

    const daysSinceLate = Math.floor(
      (Date.now() - new Date(streak.lastLateAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    const passed = daysSinceLate >= this.daysThreshold;

    return {
      passed,
      reason: passed
        ? `✓ ${daysSinceLate} days since last late payment (threshold: ${this.daysThreshold})`
        : `✗ Only ${daysSinceLate} days since last late payment (need: ${this.daysThreshold})`,
      score: Math.min((daysSinceLate / this.daysThreshold) * 100, 100),
    };
  }
}

// ── Rule 4: Utilization Health ──────────────────────────────────────────────
export class UtilizationHealthRule implements GrowthRule {
  name = "Utilization Health";
  description = "User's credit utilization is not consistently maxed out";
  
  constructor(private maxUtilizationThreshold: number = 85) {}

  async evaluate(userId: string, streak: RepaymentStreak, utilization: number = 0) {
    const passed = utilization <= this.maxUtilizationThreshold;
    return {
      passed,
      reason: passed
        ? `✓ Utilization ${Math.round(utilization)}% is healthy (threshold: ${this.maxUtilizationThreshold}%)`
        : `✗ Utilization ${Math.round(utilization)}% is high risk (threshold: ${this.maxUtilizationThreshold}%)`,
      score: 100 - (utilization / 100) * 100, // Lower utilization = higher score
    };
  }
}

// ── Rule 5: Minimum Repayment History ────────────────────────────────────────
export class MinimumRepaymentHistoryRule implements GrowthRule {
  name = "Minimum Repayment History";
  description = "User has sufficient repayment history";
  
  constructor(private minRepayments: number = 3) {}

  async evaluate(userId: string, streak: RepaymentStreak) {
    const passed = streak.totalOnTimeRepayments >= this.minRepayments;
    return {
      passed,
      reason: passed
        ? `✓ ${streak.totalOnTimeRepayments} on-time repayments (threshold: ${this.minRepayments})`
        : `✗ Only ${streak.totalOnTimeRepayments} on-time repayments (need: ${this.minRepayments})`,
      score: Math.min((streak.totalOnTimeRepayments / this.minRepayments) * 100, 100),
    };
  }
}

// ── Rule 6: Payment Consistency ─────────────────────────────────────────────
export class PaymentConsistencyRule implements GrowthRule {
  name = "Payment Consistency";
  description = "User's on-time payment percentage is high";
  
  constructor(private minConsistencyPercentage: number = 80) {}

  async evaluate(userId: string, streak: RepaymentStreak) {
    const consistency =
      streak.totalRepayments > 0
        ? (streak.totalOnTimeRepayments / streak.totalRepayments) * 100
        : 0;

    const passed = consistency >= this.minConsistencyPercentage;
    return {
      passed,
      reason: passed
        ? `✓ ${Math.round(consistency)}% on-time payment rate (threshold: ${this.minConsistencyPercentage}%)`
        : `✗ ${Math.round(consistency)}% on-time payment rate (need: ${this.minConsistencyPercentage}%)`,
      score: Math.min(consistency, 100),
    };
  }
}

// ── Rule 7: No Streak Break (Optional - for Excellent tier) ──────────────────
export class NoStreakBreakRule implements GrowthRule {
  name = "Unbroken Streak";
  description = "User has never had a broken repayment streak";
  
  constructor() {}

  async evaluate(userId: string, streak: RepaymentStreak) {
    // This would require tracking streak breaks separately
    // For now, we check if lastLateAt is undefined
    const passed = !streak.lastLateAt;
    return {
      passed,
      reason: passed
        ? "✓ Perfect payment history with no breaks"
        : "✗ Streak has been broken at some point",
      score: passed ? 100 : 50,
    };
  }
}

// ── Default Growth Rules Configuration ───────────────────────────────────────
export function getDefaultGrowthRules(): GrowthRule[] {
  return [
    new ConsecutiveOnTimeRule(4),         // 40% weight - core metric
    new FullPaymentBonusRule(2),          // 20% weight - bonus indicator
    new NoRecentLateRule(90),             // 20% weight - safety check
    new UtilizationHealthRule(85),        // 15% weight - risk indicator
    new MinimumRepaymentHistoryRule(3),   // 5% weight - baseline requirement
  ];
}

// ── Rule Weights for Scoring ────────────────────────────────────────────────
export const RULE_WEIGHTS: Record<string, number> = {
  "Consecutive On-Time Repayments": 0.40,
  "Full Payment Bonus": 0.20,
  "No Recent Late Payments": 0.20,
  "Utilization Health": 0.15,
  "Minimum Repayment History": 0.05,
};

// ── Eligibility Thresholds ──────────────────────────────────────────────────
export const ELIGIBILITY_THRESHOLDS = {
  MINIMUM_OVERALL_SCORE: 70,    // 70/100 to be eligible for growth
  EXCELLENT_SCORE: 90,           // 90+ qualifies for max growth
  GOOD_SCORE: 75,                // 75+ qualifies for moderate growth
};
