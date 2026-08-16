import { projectId } from "../../utils/supabase/info.tsx";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f415469b`;

async function req<T>(path: string, method = "GET", body?: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Types (mirrored from backend) ────────────────────────────────────────────

export type LimitTier = "INSUFFICIENT_DATA" | "LOW" | "MEDIUM" | "HIGH";
export type TxStatus = "INITIATED" | "PENDING_CONFIRMATION" | "SETTLED" | "CANCELLED" | "EXPIRED_AUTO_SETTLED";
export type TxMode = "OWN_MONEY" | "CREDIT_LINE";

export interface User { id: string; name: string; upiVpa: string; kycStatus: string; createdAt: string }
export interface CreditLine { id: string; userId: string; lenderId: string; lenderName: string; limit: number; utilized: number; heldAmount: number; status: "ACTIVE" | "SUSPENDED"; interestRate: number }
export interface Transaction { id: string; userId: string; creditLineId: string; lenderId: string; merchantName: string; amount: number; mode: TxMode; channel: "UPI" | "BNPL"; status: TxStatus; pendingSince?: string; settledAt?: string; cancelledAt?: string; createdAt: string; routingAttempts?: RoutingAttempt[] }
export interface RiskSignal { name: string; weight: number; score: number; description: string }
export interface RiskAssessment { id: string; userId: string; recommendedLimit: number; tier: LimitTier; signals: RiskSignal[]; compositeScore: number; createdAt: string }
export interface Statement { id: string; userId: string; periodStart: string; periodEnd: string; totalDue: number; minimumDue: number; dueDate: string; status: "OPEN" | "CLOSED" | "PAID"; items?: StatementLineItem[] }
export interface StatementLineItem { id: string; statementId: string; transactionId: string; lenderId: string; lenderName: string; amount: number; description: string; date: string }
export interface RepaymentStreak { userId: string; consecutiveOnTime: number; consecutiveFullPayment: number; lastLateAt?: string; updatedAt: string }
export interface AuditLog { id: string; actorId: string; action: string; entityType: string; entityId: string; reason: string; createdAt: string }
export interface RoutingAttempt { lenderId: string; lenderName: string; approved: boolean; reason: string; at: string }
export interface BNPLPlan { installments: number; perInstallment: number; total: number; interest: number; schedule: { seq: number; dueDate: string; amount: number }[] }

export interface Dashboard {
  user: User;
  creditLines: CreditLine[];
  transactions: Transaction[];
  openStatement: Statement | null;
  risk: RiskAssessment | null;
  streak: RepaymentStreak | null;
  recentLimitGrowth: AuditLog | null;
}

// ── API functions ─────────────────────────────────────────────────────────────

export const api = {
  seed: () => req<{ message: string; users: string[] }>("/seed", "POST", {}),

  listUsers: () => req<User[]>("/users"),

  dashboard: (userId: string) => req<Dashboard>(`/users/${userId}/dashboard`),

  statements: (userId: string) => req<Statement[]>(`/users/${userId}/statements`),

  auditLog: (userId?: string) =>
    req<AuditLog[]>(`/audit-log${userId ? `?userId=${userId}` : ""}`),

  consentCheck: (userId: string, creditLineId: string) =>
    req<{ valid: boolean; reason?: string }>(`/consent/check?userId=${userId}&creditLineId=${creditLineId}`),

  consentGrant: (userId: string, creditLineId: string) =>
    req<{ id: string; status: string }>("/consent/grant", "POST", { userId, creditLineId }),

  enforce: (userId: string, creditLineId: string, amount: number, channel = "UPI") =>
    req<{ approved: boolean; reason?: string; available?: number; cl?: CreditLine }>("/enforce", "POST", { userId, creditLineId, amount, channel }),

  route: (userId: string, amount: number) =>
    req<{ approved: boolean; creditLine?: CreditLine; attempts: RoutingAttempt[]; reason?: string }>("/route", "POST", { userId, amount }),

  pay: (params: { userId: string; creditLineId: string; amount: number; merchantName: string; mode: TxMode; channel?: string; idempotencyKey: string }) =>
    req<Transaction>("/settlement/initiate", "POST", params),

  confirmPayment: (transactionId: string) =>
    req<Transaction>("/settlement/confirm", "POST", { transactionId }),

  cancelPayment: (transactionId: string) =>
    req<Transaction>("/settlement/cancel", "POST", { transactionId }),

  repay: (userId: string, amount: number) =>
    req<{ success: boolean; allocation: Record<string, number>; updatedStatement: Statement; limitGrowth: any }>("/billing/repay", "POST", { userId, amount }),

  bnplPlans: (userId: string, creditLineId: string, amount: number) =>
    req<{ plans: BNPLPlan[]; amount: number; available: number }>("/bnpl/plans", "POST", { userId, creditLineId, amount }),

  bnplCreate: (params: { userId: string; creditLineId: string; amount: number; merchantName: string; installments: number; idempotencyKey: string }) =>
    req<{ transaction: Transaction; schedule: any }>("/bnpl/create-schedule", "POST", params),

  advanceDay: (userId: string) =>
    req<{ message: string }>("/demo/advance-day", "POST", { userId }),

  simulateLate: (userId: string) =>
    req<{ streak: RepaymentStreak }>("/demo/simulate-late", "POST", { userId }),
};
