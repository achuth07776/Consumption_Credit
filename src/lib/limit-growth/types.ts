/**
 * Limit Growth Engine Types
 * Implements Feature 07: Reward Good Repayment Behavior
 * 
 * SOLID Principles Applied:
 * - SRP: This module only handles growth eligibility and proposal/application
 * - OCP: New growth rules added as implementations, not by modifying core logic
 * - Encapsulation: RepaymentStreak mutations only through this module
 * - Transparency: Every decision includes human-readable reasons
 */

// ── Repayment Streak ─────────────────────────────────────────────────────────
/** Tracks a user's repayment behavior over time */
export interface RepaymentStreak {
  userId: string;
  consecutiveOnTime: number;        // Consecutive on-time repayments
  consecutiveFullPayment: number;   // Consecutive full (not minimum) payments
  lastLateAt?: string;              // Timestamp of last late payment
  totalRepayments: number;          // Lifetime repayment count
  totalOnTimeRepayments: number;    // Lifetime on-time count
  updatedAt: string;
}

// ── Growth Rules ─────────────────────────────────────────────────────────────
/** Interface for extensible growth eligibility rules (Open/Closed Principle) */
export interface GrowthRule {
  name: string;
  description: string;
  evaluate(userId: string, streak: RepaymentStreak, utilization?: number): Promise<{
    passed: boolean;
    reason: string;
    score?: number;
  }>;
}

/** Result of evaluating a single growth rule */
export interface GrowthRuleResult {
  ruleName: string;
  passed: boolean;
  reason: string;
  score?: number;
  weight?: number;
}

// ── Growth Eligibility ───────────────────────────────────────────────────────
/** Complete eligibility evaluation for limit growth */
export interface GrowthEligibility {
  userId: string;
  eligible: boolean;
  overallScore: number;           // 0-100, weighted average of rule scores
  rulesEvaluated: GrowthRuleResult[];
  eligibilityReason: string;      // Human-readable summary of why eligible/ineligible
  qualificationMetrics: {
    streakQuality: "Poor" | "Fair" | "Good" | "Excellent";
    utilizationHealth: "High Risk" | "Moderate" | "Healthy";
    paymentConsistency: number;     // Percentage of on-time payments
    daysSinceLastLate?: number;
  };
  nextEligibleAt?: string;        // When user might become eligible again (if ineligible now)
}

// ── Growth Proposal (extends existing LimitProposal) ──────────────────────────
export interface LimitProposal {
  id: string;
  userId: string;
  creditLineId: string;
  currentLimit: number;
  proposedLimit: number;
  reason: string;                 // Why the increase was proposed
  rationale: {
    streakLength: number;
    utilizationAverage: number;
    riskTierImprovement?: string;  // e.g., "LOW → MEDIUM"
    growthPercentage: number;      // e.g., 30% increase
  };
  eligibilityEvaluation: GrowthEligibility;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  createdAt: string;
  resolvedAt?: string;
  respondedAt?: string;           // When user responded
}

// ── Growth History Record ────────────────────────────────────────────────────
/** Tracks every growth event for analytics and compliance */
export interface GrowthHistoryRecord {
  id: string;
  userId: string;
  creditLineId: string;
  event: "PROPOSED" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  previousLimit: number;
  proposedLimit?: number;
  finalLimit?: number;
  reason: string;
  proposalId?: string;
  createdAt: string;
  expiresAt?: string;              // Proposal expiration (if applicable)
}

// ── Growth Statistics ────────────────────────────────────────────────────────
/** User's lifetime growth statistics */
export interface GrowthStatistics {
  userId: string;
  totalProposals: number;
  acceptedProposals: number;
  declinedProposals: number;
  acceptanceRate: number;          // 0-100
  totalLimitGrowth: number;        // Sum of all accepted increases
  averageGrowthPercrease: number;
  lastProposalAt?: string;
  lastAcceptanceAt?: string;
  currentEligibilityScore: number;  // 0-100
  streakStatus: {
    current: number;               // Current consecutive on-time count
    longest: number;               // Longest streak ever
    broken: number;                // Times streak was reset
  };
}

// ── Growth Event (for event-driven architecture) ──────────────────────────────
export interface GrowthEvent {
  type: "RepaymentReceived" | "LatePaymentDetected" | "StreakReset" | "EligibilityTriggered";
  userId: string;
  timestamp: string;
  payload: any;
}

// ── Growth Configuration ─────────────────────────────────────────────────────
/** Configurable thresholds for growth engine */
export interface GrowthEngineConfig {
  minConsecutiveOnTime: number;    // e.g., 4
  maxConsecutiveFullRequired: number; // e.g., 2 (for full payment bonus)
  maxUtilizationThreshold: number; // e.g., 85% (users maxing out are higher risk)
  daysBeforeLateResets: number;    // e.g., 90 (how long good behavior resets late history)
  proposalExpireDays: number;      // e.g., 7 (how long user has to respond to proposal)
  growthPercentageMin: number;     // e.g., 10% minimum increase
  growthPercentageMax: number;     // e.g., 50% maximum single increase
  growthCap: number;               // e.g., 200000 (max limit even with excellent behavior)
}
