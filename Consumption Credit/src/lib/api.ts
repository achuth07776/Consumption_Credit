import { projectId } from "../../utils/supabase/info.tsx";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f415469b`;

// ── Session management (sessionStorage — httpOnly cookies require same-origin) ─
// In production: use httpOnly cookies via a same-origin API proxy.

const SESSION_KEY = "cc_session_token";

export const session = {
  get: (): string | null => sessionStorage.getItem(SESSION_KEY),
  set: (token: string) => sessionStorage.setItem(SESSION_KEY, token),
  clear: () => sessionStorage.removeItem(SESSION_KEY),
};

// Callback for 401 → redirect to login (set by App)
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

// ── Core request helper ────────────────────────────────────────────────────────

async function req<T>(path: string, method = "GET", body?: object, requiresAuth = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = session.get();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && requiresAuth) {
    session.clear();
    onUnauthorized?.();
    throw new ApiError("SESSION_EXPIRED", "Session expired. Please log in again.", 401);
  }

  const data = await res.json().catch(() => ({ error: { code: "PARSE_ERROR", message: "Invalid response from server" } }));

  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(err?.code ?? "API_ERROR", err?.message ?? `Request failed (${res.status})`, res.status);
  }

  return data as T;
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type LimitTier = "INSUFFICIENT_DATA" | "LOW" | "MEDIUM" | "HIGH";
export type TxStatus = "INITIATED" | "PENDING_CONFIRMATION" | "SETTLED" | "CANCELLED" | "EXPIRED_AUTO_SETTLED";
export type TxMode = "OWN_MONEY" | "CREDIT_LINE";
export type KycStatus = "UNVERIFIED" | "SIMULATED_VERIFIED";

export interface User { id: string; phone: string; phoneVerifiedAt?: string; name: string; panNumberMasked?: string; kycStatus: KycStatus; upiVpa: string; createdAt: string; role?: "USER" | "ADMIN" }
export interface CreditLine { id: string; userId: string; lenderId: string; lenderName: string; limit: number; utilized: number; heldAmount: number; status: "ACTIVE" | "SUSPENDED"; interestRate: number; coolingOffExpiresAt?: string; firstSpentAt?: string }
export interface Transaction { id: string; userId: string; creditLineId: string; lenderId: string; merchantName: string; amount: number; mode: TxMode; channel: "UPI" | "BNPL"; status: TxStatus; pendingSince?: string; settledAt?: string; cancelledAt?: string; createdAt: string; routingAttempts?: RoutingAttempt[] }
export interface RiskSignal { name: string; weight: number; score: number; description: string }
export interface RiskAssessment { id: string; userId: string; recommendedLimit: number; tier: LimitTier; signals: RiskSignal[]; compositeScore: number; createdAt: string }
export interface Statement { id: string; userId: string; periodStart: string; periodEnd: string; totalDue: number; minimumDue: number; dueDate: string; status: "OPEN" | "CLOSED" | "PAID"; items?: StatementLineItem[] }
export interface StatementLineItem { id: string; statementId: string; transactionId: string; lenderId: string; lenderName: string; amount: number; description: string; date: string }
export interface RepaymentStreak { userId: string; consecutiveOnTime: number; consecutiveFullPayment: number; lastLateAt?: string; updatedAt: string }
export interface AuditLog { id: string; actorId: string; action: string; entityType: string; entityId: string; reason: string; createdAt: string }
export interface RoutingAttempt { lenderId: string; lenderName: string; approved: boolean; reason: string; at: string }
export interface BNPLPlan { installments: number; perInstallment: number; total: number; interest: number; schedule: { seq: number; dueDate: string; amount: number }[] }
export interface Notification { id: string; userId: string; type: string; title: string; body: string; stampStatus: string; createdAt: string; readAt?: string }
export interface LimitProposal { id: string; userId: string; creditLineId: string; currentLimit: number; proposedLimit: number; reason: string; status: "PENDING" | "ACCEPTED" | "DECLINED"; createdAt: string; resolvedAt?: string }
export interface KeyFactStatement { id: string; creditLineId: string; apr: number; totalInterestIfMaxUtilized: number; allFees: { name: string; amount: number; description: string }[]; recoveryTermsSummary: string; coolingOffDays: number; generatedAt: string }
export interface GrievanceTicket { id: string; userId: string; category: string; description: string; status: "OPEN" | "IN_PROGRESS" | "RESOLVED"; createdAt: string; resolvedAt?: string; resolution?: string }
export interface RepaymentMandate { id: string; userId: string; creditLineId: string; type: "FULL" | "MINIMUM"; active: boolean; createdAt: string }
export interface SpendInsight { totalSpend: number; breakdown: { category: string; amount: number; pct: number }[]; transactionCount: number }

export interface Dashboard {
  user: User;
  creditLines: CreditLine[];
  transactions: Transaction[];
  openStatement: Statement | null;
  risk: RiskAssessment | null;
  streak: RepaymentStreak | null;
  recentLimitGrowth: AuditLog | null;
  pendingLimitProposals: LimitProposal[];
}

export interface OtpRequestResult {
  challengeId: string;
  expiresAt: string;
  isNewUser: boolean;
  demoOtp: string;
  note: string;
}

export interface AuthResult {
  token: string;
  user: User;
  isNewUser: boolean;
  sessionId: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  requestOtp: (phone: string, purpose?: string) =>
    req<OtpRequestResult>("/auth/otp/request", "POST", { phone, purpose }, false),

  verifyOtp: (phone: string, otp: string, idempotencyKey: string) =>
    req<AuthResult>("/auth/otp/verify", "POST", { phone, otp, idempotencyKey }, false),

  simulateKyc: (pan: string, name: string, dob: string) =>
    req<{ user: User; riskAssessment: RiskAssessment; note: string }>("/auth/kyc/simulate-verify", "POST", { pan, name, dob }),

  logout: async () => {
    await req<{ success: boolean }>("/auth/logout", "POST", {}).catch(() => {});
    session.clear();
  },

  me: () => req<{ user: User; sessionId: string; expiresAt: string }>("/auth/me", "GET", undefined, false),
};

// ── Data & actions ────────────────────────────────────────────────────────────

export const api = {
  seed: () => req<{ message: string; demoPhones: Record<string, string>; users: string[] }>("/seed", "POST", {}, false),

  listUsers: () => req<User[]>("/users"),

  dashboard: (userId: string) => req<Dashboard>(`/users/${userId}/dashboard`),

  statements: (userId: string) => req<Statement[]>(`/users/${userId}/statements`),

  notifications: () => req<Notification[]>("/notifications"),

  markNotificationsRead: () => req<{ success: boolean }>("/notifications/read", "POST", {}),

  auditLog: (userId?: string) =>
    req<AuditLog[]>(`/audit-log${userId ? `?userId=${userId}` : ""}`),

  consentCheck: (creditLineId: string) =>
    req<{ valid: boolean; reason?: string }>(`/consent/check?creditLineId=${creditLineId}`),

  enforce: (creditLineId: string, amount: number, channel = "UPI") =>
    req<{ approved: boolean; reason?: string; available?: number; cl?: CreditLine }>("/enforce", "POST", { creditLineId, amount, channel }),

  route: (amount: number) =>
    req<{ approved: boolean; creditLine?: CreditLine; attempts: RoutingAttempt[]; reason?: string }>("/route", "POST", { amount }),

  pay: (params: { creditLineId: string; amount: number; merchantName: string; mode: TxMode; channel?: string; idempotencyKey: string }) =>
    req<Transaction>("/settlement/initiate", "POST", params),

  confirmPayment: (transactionId: string) =>
    req<Transaction>("/settlement/confirm", "POST", { transactionId }),

  cancelPayment: (transactionId: string) =>
    req<Transaction>("/settlement/cancel", "POST", { transactionId }),

  repay: (amount: number) =>
    req<{ success: boolean; allocation: Record<string, number>; updatedStatement: Statement; limitGrowth: any }>("/billing/repay", "POST", { amount }),

  bnplPlans: (creditLineId: string, amount: number) =>
    req<{ plans: BNPLPlan[]; amount: number; available: number }>("/bnpl/plans", "POST", { creditLineId, amount }),

  bnplCreate: (params: { creditLineId: string; amount: number; merchantName: string; installments: number; idempotencyKey: string }) =>
    req<{ transaction: Transaction; schedule: any }>("/bnpl/create-schedule", "POST", params),

  // Limit proposals
  limitProposals: () => req<LimitProposal[]>("/limit/proposals"),
  acceptProposal: (proposalId: string) => req<{ creditLine: CreditLine; proposal: LimitProposal }>("/limit/accept-proposal", "POST", { proposalId }),
  declineProposal: (proposalId: string) => req<{ proposal: LimitProposal }>("/limit/decline-proposal", "POST", { proposalId }),

  // KFS
  kfs: (creditLineId: string) => req<KeyFactStatement>(`/kfs/${creditLineId}`),

  // Cooling-off exit
  exitCoolingOff: (creditLineId: string) => req<{ totalOwed: number; principalOwed: number; interestOwed: number; creditLine: CreditLine }>("/credit-line/exit-cooling-off", "POST", { creditLineId }),

  // Grievance
  raiseGrievance: (category: string, description: string) => req<GrievanceTicket>("/grievance/raise", "POST", { category, description }),
  myGrievances: () => req<GrievanceTicket[]>("/grievance/mine"),
  allGrievances: () => req<GrievanceTicket[]>("/grievance/all"),
  resolveGrievance: (id: string, resolution: string) => req<GrievanceTicket>(`/grievance/${id}/resolve`, "POST", { resolution }),

  // Insights
  insights: (userId: string) => req<SpendInsight>(`/insights/${userId}`),

  // Mandates
  setupMandate: (creditLineId: string, type: "FULL" | "MINIMUM") => req<RepaymentMandate>("/mandate/setup", "POST", { creditLineId, type }),
  cancelMandate: (creditLineId: string) => req<RepaymentMandate>("/mandate/cancel", "POST", { creditLineId }),
  myMandates: () => req<RepaymentMandate[]>("/mandate/mine"),

  // Statement PDF — fetches with auth header, opens as blob so browser can print-to-PDF
  openStatementPdf: async (statementId: string): Promise<void> => {
    const token = session.get();
    const res = await fetch(`${BASE}/billing/statement/${statementId}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError("PDF_ERROR", "Could not load statement PDF", res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    // Revoke after a delay to allow the new tab to load
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  // Demo controls (require auth)
  demoLoginAs: (userId: string) =>
    req<{ token: string; user: User; note: string }>("/demo/login-as", "POST", { userId }, false),

  advanceDay: () => req<{ message: string }>("/demo/advance-day", "POST", {}),

  simulateLate: () => req<{ streak: any }>("/demo/simulate-late", "POST", {}),
};
