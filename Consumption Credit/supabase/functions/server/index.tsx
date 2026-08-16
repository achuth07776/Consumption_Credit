import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import * as kv from "./kv_store.tsx";
import {
  buildDefaultRules,
  CreditLineView,
  HistoricalTransaction,
  RiskEnforcementGateway,
  TransactionRequest as EnforcementRequest,
} from "./risk_enforcement.ts";

const app = new Hono();
const P = "/make-server-f415469b"; // route prefix

app.use("/*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }));

// ── Types ────────────────────────────────────────────────────────────────────

type LimitTier = "INSUFFICIENT_DATA" | "LOW" | "MEDIUM" | "HIGH";
type TxStatus = "INITIATED" | "PENDING_CONFIRMATION" | "SETTLED" | "CANCELLED" | "EXPIRED_AUTO_SETTLED";
type TxMode = "OWN_MONEY" | "CREDIT_LINE";
type TxChannel = "UPI" | "BNPL" | "CARD";
type ConsentStatus = "ACTIVE" | "REVOKED";
type ClStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

interface User { id: string; name: string; upiVpa: string; kycStatus: string; createdAt: string }
interface Lender { id: string; name: string; type: "BANK" | "NBFC"; maxTxAmount: number; priority: number }
interface CreditLine { id: string; userId: string; lenderId: string; lenderName: string; limit: number; utilized: number; heldAmount: number; status: ClStatus; interestRate: number }
interface ConsentRecord { id: string; userId: string; creditLineId: string; scope: string; grantedAt: string; expiresAt: string; revokedAt?: string; status: ConsentStatus }
interface Transaction { id: string; userId: string; creditLineId: string; lenderId: string; merchantName: string; amount: number; mode: TxMode; channel: TxChannel; status: TxStatus; idempotencyKey?: string; pendingSince?: string; settledAt?: string; cancelledAt?: string; createdAt: string; routingAttempts?: RoutingAttempt[] }
interface RiskSignal { name: string; weight: number; score: number; description: string }
interface RiskAssessment { id: string; userId: string; recommendedLimit: number; tier: LimitTier; signals: RiskSignal[]; compositeScore: number; createdAt: string }
interface Statement { id: string; userId: string; periodStart: string; periodEnd: string; totalDue: number; minimumDue: number; dueDate: string; status: "OPEN" | "CLOSED" | "PAID" }
interface StatementLineItem { id: string; statementId: string; transactionId: string; lenderId: string; lenderName: string; amount: number; description: string; date: string }
interface RepaymentStreak { userId: string; consecutiveOnTime: number; consecutiveFullPayment: number; lastLateAt?: string; updatedAt: string }
interface InstallmentItem { seq: number; dueDate: string; amount: number; status: "SCHEDULED" | "PAID" }
interface InstallmentSchedule { id: string; transactionId: string; userId: string; creditLineId: string; installments: InstallmentItem[] }
interface AuditLog { id: string; actorId: string; action: string; entityType: string; entityId: string; reason: string; createdAt: string }
interface RoutingAttempt { lenderId: string; lenderName: string; approved: boolean; reason: string; at: string }

// ── Lender configs (rules live here, not in the routing function) ─────────────

interface LenderConfig {
  id: string;
  name: string;
  type: "BANK" | "NBFC";
  maxTxAmount: number;
  priority: number;
  approves: (amount: number, available: number) => { ok: boolean; reason: string };
}

const LENDER_CONFIGS: LenderConfig[] = [
  {
    id: "lender_axis",
    name: "Axis Bank",
    type: "BANK",
    maxTxAmount: 20000,
    priority: 1,
    approves: (amount, available) => {
      if (amount > 20000) return { ok: false, reason: "Single transaction exceeds ₹20,000 Axis Bank cap" };
      if (amount > available) return { ok: false, reason: "Insufficient available limit on Axis Bank line" };
      return { ok: true, reason: "Approved" };
    },
  },
  {
    id: "lender_dmi",
    name: "DMI Finance",
    type: "NBFC",
    maxTxAmount: 15000,
    priority: 2,
    approves: (amount, available) => {
      if (amount > 15000) return { ok: false, reason: "Single transaction exceeds ₹15,000 DMI Finance cap" };
      if (amount > available) return { ok: false, reason: "Insufficient available limit on DMI Finance line" };
      return { ok: true, reason: "Approved" };
    },
  },
];

// ── Utilities ────────────────────────────────────────────────────────────────

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

async function audit(actorId: string, action: string, entityType: string, entityId: string, reason: string) {
  const entry: AuditLog = { id: uid(), actorId, action, entityType, entityId, reason, createdAt: now() };
  const existing: AuditLog[] = await kv.get(`audit:u:${actorId}`) ?? [];
  await kv.set(`audit:u:${actorId}`, [entry, ...existing].slice(0, 200));
  const all: AuditLog[] = await kv.get("audit:all") ?? [];
  await kv.set("audit:all", [entry, ...all].slice(0, 500));
}

async function updateInList<T extends { id: string }>(key: string, item: T): Promise<void> {
  const list: T[] = await kv.get(key) ?? [];
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) list[idx] = item;
  else list.unshift(item);
  await kv.set(key, list);
}

async function prependToList<T>(key: string, item: T): Promise<void> {
  const list: T[] = await kv.get(key) ?? [];
  await kv.set(key, [item, ...list]);
}

async function saveTransaction(tx: Transaction): Promise<void> {
  await Promise.all([
    kv.set(`transaction:${tx.id}`, tx),
    updateInList(`transactions:u:${tx.userId}`, tx),
    updateInList(`transactions:cl:${tx.creditLineId}`, tx),
  ]);
}

async function getCreditLine(clId: string): Promise<CreditLine | null> {
  return await kv.get(`credit_line:${clId}`);
}

async function saveCreditLine(cl: CreditLine): Promise<void> {
  await kv.set(`credit_line:${cl.id}`, cl);
  await updateInList(`credit_lines:u:${cl.userId}`, cl);
}

function currentPeriod(): { start: string; end: string; due: string } {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString();
  const due = new Date(d.getFullYear(), d.getMonth() + 1, 5).toISOString();
  return { start, end, due };
}

async function getOrCreateStatement(userId: string): Promise<Statement> {
  const existing: Statement | null = await kv.get(`stmt:open:${userId}`);
  if (existing && existing.status === "OPEN") return existing;
  const p = currentPeriod();
  const stmt: Statement = { id: uid(), userId, periodStart: p.start, periodEnd: p.end, totalDue: 0, minimumDue: 0, dueDate: p.due, status: "OPEN" };
  await kv.set(`stmt:open:${userId}`, stmt);
  await kv.set(`statement:${stmt.id}`, stmt);
  await prependToList(`statements:u:${userId}`, stmt);
  return stmt;
}

async function appendLineItem(tx: Transaction, cl: CreditLine): Promise<void> {
  const stmt = await getOrCreateStatement(tx.userId);
  const item: StatementLineItem = {
    id: uid(), statementId: stmt.id, transactionId: tx.id,
    lenderId: tx.lenderId, lenderName: cl.lenderName,
    amount: tx.amount, description: tx.merchantName,
    date: tx.settledAt ?? now(),
  };
  const items: StatementLineItem[] = await kv.get(`stmt_items:${stmt.id}`) ?? [];
  items.push(item);
  const total = items.reduce((s, i) => s + i.amount, 0);
  const updated: Statement = { ...stmt, totalDue: total, minimumDue: Math.ceil(total * 0.05) };
  await kv.set(`stmt_items:${stmt.id}`, items);
  await kv.set(`statement:${stmt.id}`, updated);
  await kv.set(`stmt:open:${userId}`, updated);
  await updateInList(`statements:u:${tx.userId}`, updated);
}

// ── Module 1: Risk Engine ────────────────────────────────────────────────────

function computeRisk(txHistory: Transaction[]): { tier: LimitTier; limit: number; signals: RiskSignal[]; composite: number } {
  const recentTxs = txHistory.filter(t => {
    const age = Date.now() - new Date(t.createdAt).getTime();
    return age < 90 * 24 * 60 * 60 * 1000; // last 90 days
  });

  const freq = Math.min(recentTxs.length, 30);
  const freqScore = (freq / 30) * 100;

  const amounts = recentTxs.map(t => t.amount);
  const avgTicket = amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const avgScore = Math.min((avgTicket / 5000) * 100, 100);

  const uniqueMerchants = new Set(recentTxs.map(t => t.merchantName)).size;
  const divScore = Math.min((uniqueMerchants / 8) * 100, 100);

  const settled = txHistory.filter(t => t.status === "SETTLED").length;
  const regularity = txHistory.length > 0 ? (settled / txHistory.length) * 100 : 0;

  const ageMs = txHistory.length > 0
    ? Date.now() - new Date(txHistory[txHistory.length - 1].createdAt).getTime()
    : 0;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const ageScore = Math.min((ageDays / 180) * 100, 100);

  const signals: RiskSignal[] = [
    { name: "transactionFrequency", weight: 0.25, score: freqScore, description: `${freq} transactions in last 90 days` },
    { name: "averageTicketSize", weight: 0.20, score: avgScore, description: `Avg ₹${Math.round(avgTicket).toLocaleString("en-IN")} per transaction` },
    { name: "merchantDiversity", weight: 0.20, score: divScore, description: `${uniqueMerchants} unique merchants` },
    { name: "paymentRegularity", weight: 0.25, score: regularity, description: `${Math.round(regularity)}% settlement rate` },
    { name: "accountAge", weight: 0.10, score: ageScore, description: `${Math.round(ageDays)} days history` },
  ];

  const composite = signals.reduce((acc, s) => acc + s.score * s.weight, 0);

  if (txHistory.length < 2) return { tier: "INSUFFICIENT_DATA", limit: 5000, signals, composite };
  if (composite < 30) return { tier: "LOW", limit: Math.round((10000 + composite * 200) / 1000) * 1000, signals, composite };
  if (composite < 55) return { tier: "MEDIUM", limit: Math.round((20000 + composite * 300) / 1000) * 1000, signals, composite };
  return { tier: "HIGH", limit: Math.min(Math.round((40000 + composite * 600) / 1000) * 1000, 100000), signals, composite };
}

app.post(`${P}/risk/assess`, async (c) => {
  const { userId } = await c.req.json();
  if (!userId) return c.json({ error: "userId required" }, 400);
  const txHistory: Transaction[] = await kv.get(`transactions:u:${userId}`) ?? [];
  const { tier, limit, signals, composite } = computeRisk(txHistory);
  const ra: RiskAssessment = { id: uid(), userId, recommendedLimit: limit, tier, signals, compositeScore: composite, createdAt: now() };
  await kv.set(`risk_latest:${userId}`, ra);
  await audit(userId, "RISK_ASSESSED", "RiskAssessment", ra.id, `Tier: ${tier}, Limit: ₹${limit}`);
  return c.json(ra);
});

// ── Module 2: Consent ────────────────────────────────────────────────────────

app.post(`${P}/consent/grant`, async (c) => {
  const { userId, creditLineId } = await c.req.json();
  if (!userId || !creditLineId) return c.json({ error: "userId and creditLineId required" }, 400);
  const cl = await getCreditLine(creditLineId);
  if (!cl) return c.json({ error: "Credit line not found" }, 404);
  if (cl.userId !== userId) return c.json({ error: "Credit line does not belong to user" }, 403);
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const consent: ConsentRecord = { id: uid(), userId, creditLineId, scope: "SPEND,REPAY,STATEMENT_VIEW", grantedAt: now(), expiresAt: expires, status: "ACTIVE" };
  await kv.set(`consent:${consent.id}`, consent);
  await kv.set(`consent:active:${userId}:${creditLineId}`, consent);
  await audit(userId, "CONSENT_GRANTED", "ConsentRecord", consent.id, `Scope: ${consent.scope}`);
  return c.json(consent);
});

app.post(`${P}/consent/revoke`, async (c) => {
  const { userId, creditLineId } = await c.req.json();
  const consent: ConsentRecord | null = await kv.get(`consent:active:${userId}:${creditLineId}`);
  if (!consent) return c.json({ error: "No active consent found" }, 404);
  const revoked: ConsentRecord = { ...consent, revokedAt: now(), status: "REVOKED" };
  await kv.set(`consent:${consent.id}`, revoked);
  await kv.set(`consent:active:${userId}:${creditLineId}`, revoked);
  await audit(userId, "CONSENT_REVOKED", "ConsentRecord", consent.id, "User initiated revocation");
  return c.json(revoked);
});

app.get(`${P}/consent/check`, async (c) => {
  const userId = c.req.query("userId");
  const creditLineId = c.req.query("creditLineId");
  if (!userId || !creditLineId) return c.json({ valid: false, reason: "Missing parameters" });
  const consent: ConsentRecord | null = await kv.get(`consent:active:${userId}:${creditLineId}`);
  if (!consent) return c.json({ valid: false, reason: "No consent record found" });
  if (consent.status !== "ACTIVE") return c.json({ valid: false, reason: "Consent has been revoked" });
  if (new Date(consent.expiresAt) < new Date()) return c.json({ valid: false, reason: "Consent has expired" });
  return c.json({ valid: true, consent });
});

// ── Module 3: Unified Risk Enforcement ────────────────────────────────────────
//
// THIS IS THE ONLY PLACE limit/risk rules are enforced.
// Settlement (Feature 04), BNPL (Feature 08), and any future payment channel
// MUST call buildGateway() and invoke gateway.enforce() — never implement
// their own limit check inline.
// See risk_enforcement.ts for rule implementations and design rationale.

/**
 * Builds a fully-wired RiskEnforcementGateway connected to KV.
 *
 * Extracted as a shared helper so every credit-consuming channel
 * (/enforce, /bnpl/create-schedule, and future routes) can call the
 * gateway without duplicating the KV wiring. The gateway itself (and the
 * rules inside it) remains unchanged — this is only the adapter layer.
 */
function buildGateway(): RiskEnforcementGateway {
  const consentChecker = {
    isConsentValid: async (uid: string, clId: string): Promise<boolean> => {
      const consent: ConsentRecord | null = await kv.get(`consent:active:${uid}:${clId}`);
      if (!consent || consent.status !== "ACTIVE") return false;
      if (new Date(consent.expiresAt) < new Date()) return false;
      return true;
    },
  };

  const getRecentTransactions = async (uid: string, windowDays: number): Promise<HistoricalTransaction[]> => {
    const txs: Transaction[] = await kv.get(`transactions:u:${uid}`) ?? [];
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    return txs
      .filter((t) => t.status === "SETTLED" && new Date(t.createdAt).getTime() >= cutoff)
      .map((t) => ({ merchantId: t.merchantName, amount: t.amount, createdAt: t.createdAt }));
  };

  const getCreditLineView = async (clId: string): Promise<CreditLineView | null> => {
    const cl = await getCreditLine(clId);
    if (!cl) return null;
    return {
      id: cl.id,
      userId: cl.userId,
      limit: cl.limit,
      utilized: cl.utilized,
      heldAmount: cl.heldAmount,
      status: cl.status,
      // allowedChannels not present on legacy records → undefined = all permitted
      allowedChannels: (cl as any).allowedChannels,
    };
  };

  const rules = buildDefaultRules(consentChecker, getRecentTransactions);
  return new RiskEnforcementGateway(rules, getCreditLineView);
}

app.post(`${P}/enforce`, async (c) => {
  const { userId, creditLineId, amount, channel, merchantId } = await c.req.json();

  // Fail closed — any missing param = declined before reaching the gateway
  if (!userId || !creditLineId || !amount) {
    return c.json({ approved: false, reason: "Incomplete request: userId, creditLineId, and amount are required" });
  }

  const req: EnforcementRequest = {
    userId,
    creditLineId,
    amount,
    channel: (channel ?? "UPI") as TxChannel,
    merchantId: merchantId ?? "unknown",
  };

  const enforcement = await buildGateway().enforce(req);

  if (enforcement.status === "DECLINED") {
    await audit(userId, "ENFORCEMENT_DECLINED", "CreditLine", creditLineId, enforcement.reason);
    return c.json({ approved: false, reason: enforcement.reason });
  }

  // Approved — return available limit and credit line for callers that need it
  const cl = await getCreditLine(creditLineId);
  const available = cl ? cl.limit - cl.utilized - cl.heldAmount : 0;
  return c.json({ approved: true, available, cl });
});

// ── Module 4: Settlement ─────────────────────────────────────────────────────

app.post(`${P}/settlement/initiate`, async (c) => {
  const { userId, creditLineId, amount, merchantName, mode, channel, idempotencyKey } = await c.req.json();
  if (!userId || !creditLineId || !amount || !merchantName) return c.json({ error: "Missing required fields" }, 400);

  // Idempotency check
  if (idempotencyKey) {
    const existing = await kv.get(`idem:${idempotencyKey}`);
    if (existing) return c.json({ ...existing, idempotent: true });
  }

  const cl = await getCreditLine(creditLineId);
  if (!cl) return c.json({ error: "Credit line not found" }, 404);

  const isLarge = amount > 10000;
  const txStatus: TxStatus = isLarge ? "PENDING_CONFIRMATION" : "SETTLED";
  const ts = now();

  const tx: Transaction = {
    id: uid(), userId, creditLineId, lenderId: cl.lenderId, merchantName,
    amount, mode: mode ?? "CREDIT_LINE", channel: channel ?? "UPI",
    status: txStatus, idempotencyKey,
    pendingSince: isLarge ? ts : undefined,
    settledAt: isLarge ? undefined : ts,
    createdAt: ts,
  };

  // Update credit line
  if (isLarge) {
    await saveCreditLine({ ...cl, heldAmount: cl.heldAmount + amount });
  } else {
    await saveCreditLine({ ...cl, utilized: cl.utilized + amount });
    await appendLineItem(tx, cl);
  }

  await saveTransaction(tx);
  if (idempotencyKey) await kv.set(`idem:${idempotencyKey}`, tx);
  await audit(userId, "TRANSACTION_INITIATED", "Transaction", tx.id, `${txStatus}: ₹${amount} at ${merchantName}`);
  return c.json(tx);
});

app.post(`${P}/settlement/confirm`, async (c) => {
  const { transactionId } = await c.req.json();
  const tx: Transaction | null = await kv.get(`transaction:${transactionId}`);
  if (!tx) return c.json({ error: "Transaction not found" }, 404);
  if (tx.status !== "PENDING_CONFIRMATION") return c.json({ error: `Cannot confirm transaction in status ${tx.status}` }, 400);
  const cl = await getCreditLine(tx.creditLineId);
  if (!cl) return c.json({ error: "Credit line not found" }, 404);

  const settled: Transaction = { ...tx, status: "SETTLED", settledAt: now() };
  await saveCreditLine({ ...cl, utilized: cl.utilized + tx.amount, heldAmount: Math.max(0, cl.heldAmount - tx.amount) });
  await saveTransaction(settled);
  await appendLineItem(settled, cl);
  await audit(tx.userId, "TRANSACTION_SETTLED", "Transaction", tx.id, "Manual confirm");
  return c.json(settled);
});

app.post(`${P}/settlement/cancel`, async (c) => {
  const { transactionId } = await c.req.json();
  const tx: Transaction | null = await kv.get(`transaction:${transactionId}`);
  if (!tx) return c.json({ error: "Transaction not found" }, 404);
  if (tx.status !== "PENDING_CONFIRMATION") return c.json({ error: `Cannot cancel transaction in status ${tx.status}` }, 400);
  const cl = await getCreditLine(tx.creditLineId);
  if (!cl) return c.json({ error: "Credit line not found" }, 404);

  const cancelled: Transaction = { ...tx, status: "CANCELLED", cancelledAt: now() };
  await saveCreditLine({ ...cl, heldAmount: Math.max(0, cl.heldAmount - tx.amount) });
  await saveTransaction(cancelled);
  await audit(tx.userId, "TRANSACTION_CANCELLED", "Transaction", tx.id, "User cancelled during hold window");
  return c.json(cancelled);
});

// Auto-settle all expired pending transactions (> 1 hour old)
app.post(`${P}/settlement/auto-settle`, async (c) => {
  const { userId } = await c.req.json();
  const txs: Transaction[] = await kv.get(`transactions:u:${userId}`) ?? [];
  const cutoff = Date.now() - 60 * 60 * 1000;
  const toSettle = txs.filter(t => t.status === "PENDING_CONFIRMATION" && t.pendingSince && new Date(t.pendingSince).getTime() < cutoff);
  const results: Transaction[] = [];
  for (const tx of toSettle) {
    const cl = await getCreditLine(tx.creditLineId);
    if (!cl) continue;
    const settled: Transaction = { ...tx, status: "EXPIRED_AUTO_SETTLED", settledAt: now() };
    await saveCreditLine({ ...cl, utilized: cl.utilized + tx.amount, heldAmount: Math.max(0, cl.heldAmount - tx.amount) });
    await saveTransaction(settled);
    await appendLineItem(settled, cl);
    await audit(tx.userId, "TRANSACTION_AUTO_SETTLED", "Transaction", tx.id, "1-hour hold expired");
    results.push(settled);
  }
  return c.json({ settled: results.length, transactions: results });
});

// ── Module 5: Multi-Lender Routing ───────────────────────────────────────────

app.post(`${P}/route`, async (c) => {
  const { userId, amount } = await c.req.json();
  if (!userId || !amount) return c.json({ error: "userId and amount required" }, 400);

  const creditLines: CreditLine[] = await kv.get(`credit_lines:u:${userId}`) ?? [];
  const activeCls = creditLines.filter(cl => cl.status === "ACTIVE");

  // Sort by lender priority
  const sorted = [...activeCls].sort((a, b) => {
    const ca = LENDER_CONFIGS.find(l => l.id === a.lenderId);
    const cb = LENDER_CONFIGS.find(l => l.id === b.lenderId);
    return (ca?.priority ?? 99) - (cb?.priority ?? 99);
  });

  const attempts: RoutingAttempt[] = [];

  for (const cl of sorted) {
    const config = LENDER_CONFIGS.find(l => l.id === cl.lenderId);
    if (!config) continue;
    const available = cl.limit - cl.utilized - cl.heldAmount;
    const result = config.approves(amount, available);
    attempts.push({ lenderId: cl.lenderId, lenderName: cl.lenderName, approved: result.ok, reason: result.reason, at: now() });
    if (result.ok) {
      await audit(userId, "ROUTE_APPROVED", "CreditLine", cl.id, `Routed ₹${amount} via ${cl.lenderName}. ${attempts.length - 1 > 0 ? `After ${attempts.length - 1} fallback(s)` : "Primary lender"}`);
      return c.json({ approved: true, creditLine: cl, attempts });
    }
  }

  await audit(userId, "ROUTE_DECLINED", "User", userId, `All ${attempts.length} lenders declined ₹${amount}`);
  return c.json({ approved: false, attempts, reason: attempts[attempts.length - 1]?.reason ?? "No eligible lender" });
});

// ── Module 6: Unified Billing ────────────────────────────────────────────────

app.post(`${P}/billing/repay`, async (c) => {
  const { userId, amount } = await c.req.json();
  if (!userId || !amount) return c.json({ error: "userId and amount required" }, 400);

  const stmt: Statement | null = await kv.get(`stmt:open:${userId}`);
  if (!stmt) return c.json({ error: "No open statement" }, 404);

  const items: StatementLineItem[] = await kv.get(`stmt_items:${stmt.id}`) ?? [];
  const lenderTotals: Record<string, { lenderName: string; total: number }> = {};
  for (const item of items) {
    if (!lenderTotals[item.lenderId]) lenderTotals[item.lenderId] = { lenderName: item.lenderName, total: 0 };
    lenderTotals[item.lenderId].total += item.amount;
  }

  // Proportional allocation
  const grandTotal = Object.values(lenderTotals).reduce((s, v) => s + v.total, 0);
  const allocation: Record<string, number> = {};
  let remaining = amount;
  const lenderEntries = Object.entries(lenderTotals);

  for (let i = 0; i < lenderEntries.length; i++) {
    const [lid, info] = lenderEntries[i];
    const isLast = i === lenderEntries.length - 1;
    const share = isLast ? remaining : Math.round((info.total / grandTotal) * amount);
    allocation[lid] = share;
    remaining -= share;
  }

  // Reduce credit line utilization for each lender
  const creditLines: CreditLine[] = await kv.get(`credit_lines:u:${userId}`) ?? [];
  for (const [lid, repaid] of Object.entries(allocation)) {
    const cl = creditLines.find(cl => cl.lenderId === lid);
    if (cl) await saveCreditLine({ ...cl, utilized: Math.max(0, cl.utilized - repaid) });
  }

  const isFullRepayment = amount >= stmt.totalDue;
  const newTotal = Math.max(0, stmt.totalDue - amount);
  const updatedStmt: Statement = { ...stmt, totalDue: newTotal, minimumDue: Math.ceil(newTotal * 0.05), status: newTotal <= 0 ? "PAID" : "OPEN" };
  await kv.set(`statement:${stmt.id}`, updatedStmt);
  await kv.set(`stmt:open:${userId}`, updatedStmt);
  await updateInList(`statements:u:${userId}`, updatedStmt);

  await audit(userId, "REPAYMENT_RECORDED", "Statement", stmt.id, `₹${amount} repaid. Allocation: ${JSON.stringify(allocation)}`);

  // Trigger Module 7 — Limit Growth
  const growthResult = await checkLimitGrowth(userId, isFullRepayment, false);

  return c.json({ success: true, allocation, updatedStatement: updatedStmt, limitGrowth: growthResult });
});

// ── Module 7: Limit Growth Engine ────────────────────────────────────────────

async function checkLimitGrowth(userId: string, wasOnTime: boolean, wasLate: boolean): Promise<any> {
  let streak: RepaymentStreak = await kv.get(`streak:${userId}`) ?? { userId, consecutiveOnTime: 0, consecutiveFullPayment: 0, updatedAt: now() };

  if (wasLate) {
    streak = { ...streak, consecutiveOnTime: 0, consecutiveFullPayment: 0, lastLateAt: now(), updatedAt: now() };
    await kv.set(`streak:${userId}`, streak);
    return null;
  }

  streak = { ...streak, consecutiveOnTime: streak.consecutiveOnTime + 1, consecutiveFullPayment: wasOnTime ? streak.consecutiveFullPayment + 1 : 0, updatedAt: now() };
  await kv.set(`streak:${userId}`, streak);

  // Trigger growth at 4 consecutive on-time full repayments
  if (streak.consecutiveOnTime >= 4) {
    const txHistory: Transaction[] = await kv.get(`transactions:u:${userId}`) ?? [];
    const { tier, limit } = computeRisk(txHistory);
    const creditLines: CreditLine[] = await kv.get(`credit_lines:u:${userId}`) ?? [];

    const increased: CreditLine[] = [];
    for (const cl of creditLines.filter(c => c.status === "ACTIVE")) {
      const proportion = cl.limit / (creditLines.reduce((s, c) => s + c.limit, 1));
      const newLimit = Math.round(Math.min(cl.limit * 1.3, limit * proportion) / 1000) * 1000;
      if (newLimit > cl.limit) {
        const updated = { ...cl, limit: newLimit };
        await saveCreditLine(updated);
        await audit(userId, "LIMIT_INCREASED", "CreditLine", cl.id, `${streak.consecutiveOnTime} consecutive on-time repayments. ₹${cl.limit} → ₹${newLimit}`);
        increased.push(updated);
      }
    }

    if (increased.length > 0) {
      const totalOld = creditLines.reduce((s, c) => s + c.limit, 0);
      const totalNew = increased.reduce((s, c) => s + c.limit, 0) + creditLines.filter(c => !increased.find(i => i.id === c.id)).reduce((s, c) => s + c.limit, 0);
      return { triggered: true, reason: `${streak.consecutiveOnTime} consecutive on-time repayments`, oldTotal: totalOld, newTotal: totalNew, creditLines: increased };
    }
  }

  return { triggered: false, streak };
}

// ── Module 8: BNPL ────────────────────────────────────────────────────────────

app.post(`${P}/bnpl/plans`, async (c) => {
  const { userId, creditLineId, amount } = await c.req.json();
  if (!userId || !creditLineId || !amount) return c.json({ error: "Missing required fields" }, 400);
  const cl = await getCreditLine(creditLineId);
  if (!cl) return c.json({ error: "Credit line not found" }, 404);
  const available = cl.limit - cl.utilized - cl.heldAmount;
  if (amount > available) return c.json({ error: "Insufficient limit for BNPL", available }, 400);

  const monthlyRate = cl.interestRate / 12;
  const plans = [2, 3, 4].map(n => {
    const interest = Math.round(amount * monthlyRate * n);
    const total = amount + interest;
    const perInstallment = Math.ceil(total / n);
    const schedule = Array.from({ length: n }).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() + i + 1, 5);
      return { seq: i + 1, dueDate: d.toISOString(), amount: perInstallment };
    });
    return { installments: n, perInstallment, total, interest, monthlyRate, schedule };
  });

  return c.json({ plans, amount, available });
});

app.post(`${P}/bnpl/create-schedule`, async (c) => {
  const { userId, creditLineId, amount, merchantName, installments, idempotencyKey } = await c.req.json();
  if (!userId || !creditLineId || !amount || !merchantName || !installments) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  // ── Step 1: Enforce via RiskEnforcementGateway (Feature 03) ────────────────
  // BNPL authorization must pass through the same gate as every other
  // credit-consuming channel. No separate BNPL risk or limit check here.
  const enfReq: EnforcementRequest = {
    userId,
    creditLineId,
    amount,
    channel: "BNPL",
    merchantId: merchantName, // merchantName is the merchant identifier in this model
  };

  const enforcement = await buildGateway().enforce(enfReq);

  if (enforcement.status === "DECLINED") {
    await audit(userId, "ENFORCEMENT_DECLINED", "CreditLine", creditLineId, enforcement.reason);
    return c.json({ error: enforcement.reason, approved: false }, 422);
  }

  // ── Step 2: Proceed to BNPL transaction + schedule creation ────────────────
  const cl = await getCreditLine(creditLineId);
  if (!cl) return c.json({ error: "Credit line not found" }, 404);

  const monthlyRate = cl.interestRate / 12;
  const interest = Math.round(amount * monthlyRate * installments);
  const total = amount + interest;
  const perInstallment = Math.ceil(total / installments);

  // Create the transaction (SETTLED — BNPL authorization is immediate)
  const tx: Transaction = {
    id: uid(), userId, creditLineId, lenderId: cl.lenderId, merchantName,
    amount, mode: "CREDIT_LINE", channel: "BNPL",
    status: "SETTLED", settledAt: now(),
    idempotencyKey, createdAt: now(),
  };

  await saveCreditLine({ ...cl, utilized: cl.utilized + amount });

  const schedule: InstallmentItem[] = Array.from({ length: installments }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i + 1, 5);
    return { seq: i + 1, dueDate: d.toISOString(), amount: perInstallment, status: "SCHEDULED" };
  });

  const instSchedule: InstallmentSchedule = { id: uid(), transactionId: tx.id, userId, creditLineId, installments: schedule };
  await kv.set(`installment:${instSchedule.id}`, instSchedule);
  await kv.set(`installment:tx:${tx.id}`, instSchedule);

  await saveTransaction(tx);
  await appendLineItem(tx, cl);
  await audit(userId, "BNPL_CREATED", "Transaction", tx.id, `₹${amount} BNPL over ${installments} installments at ${merchantName}`);

  return c.json({ transaction: tx, schedule: instSchedule });
});

// ── Data Query Endpoints ──────────────────────────────────────────────────────

app.get(`${P}/users`, async (c) => {
  const users: User[] = await kv.get("users") ?? [];
  return c.json(users);
});

app.get(`${P}/users/:id/dashboard`, async (c) => {
  const userId = c.req.param("id");
  const [user, creditLines, txs, openStmt, risk, streak] = await Promise.all([
    kv.get(`user:${userId}`) as Promise<User | null>,
    kv.get(`credit_lines:u:${userId}`) as Promise<CreditLine[] | null>,
    kv.get(`transactions:u:${userId}`) as Promise<Transaction[] | null>,
    kv.get(`stmt:open:${userId}`) as Promise<Statement | null>,
    kv.get(`risk_latest:${userId}`) as Promise<RiskAssessment | null>,
    kv.get(`streak:${userId}`) as Promise<RepaymentStreak | null>,
  ]);
  if (!user) return c.json({ error: "User not found" }, 404);

  // Check for recent limit growth (last audit entry)
  const audits: AuditLog[] = await kv.get(`audit:u:${userId}`) ?? [];
  const recentGrowth = audits.find(a => a.action === "LIMIT_INCREASED" && Date.now() - new Date(a.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000);

  return c.json({ user, creditLines: creditLines ?? [], transactions: (txs ?? []).slice(0, 12), openStatement: openStmt, risk, streak, recentLimitGrowth: recentGrowth ?? null });
});

app.get(`${P}/users/:id/statements`, async (c) => {
  const userId = c.req.param("id");
  const stmts: Statement[] = await kv.get(`statements:u:${userId}`) ?? [];
  const withItems = await Promise.all(stmts.map(async s => ({
    ...s,
    items: await kv.get(`stmt_items:${s.id}`) ?? [],
  })));
  return c.json(withItems);
});

app.get(`${P}/audit-log`, async (c) => {
  const userId = c.req.query("userId");
  const logs: AuditLog[] = userId
    ? await kv.get(`audit:u:${userId}`) ?? []
    : await kv.get("audit:all") ?? [];
  return c.json(logs.slice(0, 100));
});

// ── Demo Controls ────────────────────────────────────────────────────────────

app.post(`${P}/demo/advance-day`, async (c) => {
  const { userId } = await c.req.json();
  // Auto-settle any pending txs older than 1 hour (simulate next-day)
  const txs: Transaction[] = await kv.get(`transactions:u:${userId}`) ?? [];
  let count = 0;
  for (const tx of txs.filter(t => t.status === "PENDING_CONFIRMATION")) {
    const cl = await getCreditLine(tx.creditLineId);
    if (!cl) continue;
    const settled: Transaction = { ...tx, status: "EXPIRED_AUTO_SETTLED", settledAt: now() };
    await saveCreditLine({ ...cl, utilized: cl.utilized + tx.amount, heldAmount: Math.max(0, cl.heldAmount - tx.amount) });
    await saveTransaction(settled);
    await appendLineItem(settled, cl);
    await audit(tx.userId, "TRANSACTION_AUTO_SETTLED", "Transaction", tx.id, "Advance time: 1-hour hold expired");
    count++;
  }
  return c.json({ message: `Settled ${count} pending transaction(s)` });
});

app.post(`${P}/demo/simulate-late`, async (c) => {
  const { userId } = await c.req.json();
  const streak: RepaymentStreak = await kv.get(`streak:${userId}`) ?? { userId, consecutiveOnTime: 0, consecutiveFullPayment: 0, updatedAt: now() };
  const updated = { ...streak, consecutiveOnTime: 0, consecutiveFullPayment: 0, lastLateAt: now(), updatedAt: now() };
  await kv.set(`streak:${userId}`, updated);
  await audit(userId, "LATE_PAYMENT_SIMULATED", "User", userId, "Demo: simulated late repayment, streak reset");
  return c.json({ streak: updated });
});

// ── Seed ─────────────────────────────────────────────────────────────────────

app.post(`${P}/seed`, async (c) => {
  const force = (await c.req.json().catch(() => ({}))).force ?? false;
  const existing: User[] = await kv.get("users") ?? [];
  if (existing.length > 0 && !force) return c.json({ message: "Already seeded", users: existing });

  const lenders: Lender[] = [
    { id: "lender_axis", name: "Axis Bank", type: "BANK", maxTxAmount: 20000, priority: 1 },
    { id: "lender_dmi", name: "DMI Finance", type: "NBFC", maxTxAmount: 15000, priority: 2 },
  ];
  for (const l of lenders) await kv.set(`lender:${l.id}`, l);

  // Helper: create a user with credit lines and historical transactions
  async function seedUser(
    u: User,
    lines: { lenderId: string; limit: number; utilized: number }[],
    txData: { daysAgo: number; merchant: string; amount: number; status: TxStatus }[],
  ) {
    await kv.set(`user:${u.id}`, u);
    const allUsers: User[] = await kv.get("users") ?? [];
    if (!allUsers.find(x => x.id === u.id)) await kv.set("users", [...allUsers, u]);

    const creditLines: CreditLine[] = lines.map(l => ({
      id: `cl_${u.id}_${l.lenderId}`,
      userId: u.id, lenderId: l.lenderId,
      lenderName: lenders.find(x => x.id === l.lenderId)!.name,
      limit: l.limit, utilized: l.utilized, heldAmount: 0,
      status: "ACTIVE" as ClStatus, interestRate: 0.015,
    }));
    for (const cl of creditLines) await saveCreditLine(cl);

    // Auto-grant consent for each line
    for (const cl of creditLines) {
      const consent: ConsentRecord = { id: uid(), userId: u.id, creditLineId: cl.id, scope: "SPEND,REPAY,STATEMENT_VIEW", grantedAt: new Date(Date.now() - 90 * 86400000).toISOString(), expiresAt: new Date(Date.now() + 275 * 86400000).toISOString(), status: "ACTIVE" };
      await kv.set(`consent:${consent.id}`, consent);
      await kv.set(`consent:active:${u.id}:${cl.id}`, consent);
    }

    // Create transactions
    const txList: Transaction[] = [];
    for (const t of txData) {
      const cl = creditLines[0];
      const createdAt = new Date(Date.now() - t.daysAgo * 86400000).toISOString();
      const tx: Transaction = { id: uid(), userId: u.id, creditLineId: cl.id, lenderId: cl.lenderId, merchantName: t.merchant, amount: t.amount, mode: "CREDIT_LINE", channel: "UPI", status: t.status, createdAt, settledAt: t.status === "SETTLED" ? createdAt : undefined };
      txList.push(tx);
      await kv.set(`transaction:${tx.id}`, tx);
      if (t.status === "SETTLED") await appendLineItem(tx, cl);
    }
    await kv.set(`transactions:u:${u.id}`, txList.reverse()); // newest first

    // Streak
    const streak: RepaymentStreak = { userId: u.id, consecutiveOnTime: 4, consecutiveFullPayment: 4, updatedAt: now() };
    await kv.set(`streak:${u.id}`, streak);

    // Risk assessment
    const { tier, limit, signals, composite } = computeRisk(txList);
    const ra: RiskAssessment = { id: uid(), userId: u.id, recommendedLimit: limit, tier, signals, compositeScore: composite, createdAt: now() };
    await kv.set(`risk_latest:${u.id}`, ra);
  }

  // User 1: Priya Mehta — good payer, moderate spend (MEDIUM risk)
  await seedUser(
    { id: "u_priya", name: "Priya Mehta", upiVpa: "priya@axisb", kycStatus: "VERIFIED", createdAt: new Date(Date.now() - 180 * 86400000).toISOString() },
    [{ lenderId: "lender_axis", limit: 30000, utilized: 8520 }, { lenderId: "lender_dmi", limit: 15000, utilized: 3370 }],
    [
      { daysAgo: 75, merchant: "BookMyShow", amount: 840, status: "SETTLED" },
      { daysAgo: 68, merchant: "Swiggy", amount: 320, status: "SETTLED" },
      { daysAgo: 60, merchant: "IRCTC", amount: 1840, status: "SETTLED" },
      { daysAgo: 52, merchant: "Amazon", amount: 2200, status: "SETTLED" },
      { daysAgo: 45, merchant: "Repayment", amount: 5200, status: "SETTLED" },
      { daysAgo: 38, merchant: "Zomato", amount: 450, status: "SETTLED" },
      { daysAgo: 30, merchant: "Myntra", amount: 2200, status: "SETTLED" },
      { daysAgo: 22, merchant: "Repayment", amount: 3000, status: "SETTLED" },
      { daysAgo: 14, merchant: "Swiggy Instamart", amount: 720, status: "SETTLED" },
      { daysAgo: 8, merchant: "Amazon", amount: 3200, status: "SETTLED" },
      { daysAgo: 3, merchant: "PhonePe", amount: 2000, status: "SETTLED" },
      { daysAgo: 1, merchant: "Zomato", amount: 450, status: "SETTLED" },
    ],
  );

  // User 2: Arjun Sharma — dormant account (INSUFFICIENT_DATA)
  await seedUser(
    { id: "u_arjun", name: "Arjun Sharma", upiVpa: "arjun@ybl", kycStatus: "VERIFIED", createdAt: new Date(Date.now() - 200 * 86400000).toISOString() },
    [{ lenderId: "lender_dmi", limit: 5000, utilized: 0 }],
    [
      { daysAgo: 120, merchant: "Amazon", amount: 500, status: "SETTLED" },
    ],
  );

  // User 3: Rahul Verma — high frequency, high spend (HIGH risk)
  await seedUser(
    { id: "u_rahul", name: "Rahul Verma", upiVpa: "rahul@oksbi", kycStatus: "VERIFIED", createdAt: new Date(Date.now() - 365 * 86400000).toISOString() },
    [{ lenderId: "lender_axis", limit: 50000, utilized: 12000 }, { lenderId: "lender_dmi", limit: 20000, utilized: 4000 }],
    [
      { daysAgo: 85, merchant: "Flipkart", amount: 8500, status: "SETTLED" },
      { daysAgo: 78, merchant: "Amazon", amount: 4200, status: "SETTLED" },
      { daysAgo: 70, merchant: "Swiggy", amount: 380, status: "SETTLED" },
      { daysAgo: 63, merchant: "IRCTC", amount: 3200, status: "SETTLED" },
      { daysAgo: 55, merchant: "Myntra", amount: 5600, status: "SETTLED" },
      { daysAgo: 48, merchant: "BigBasket", amount: 2100, status: "SETTLED" },
      { daysAgo: 40, merchant: "Zomato", amount: 650, status: "SETTLED" },
      { daysAgo: 32, merchant: "Apple Store", amount: 15000, status: "SETTLED" },
      { daysAgo: 24, merchant: "Repayment", amount: 20000, status: "SETTLED" },
      { daysAgo: 16, merchant: "Cred", amount: 3000, status: "SETTLED" },
      { daysAgo: 8, merchant: "Amazon", amount: 7500, status: "SETTLED" },
      { daysAgo: 2, merchant: "Swiggy", amount: 420, status: "SETTLED" },
    ],
  );

  // User 4: Sneha Patel — new user (INSUFFICIENT_DATA → starter limit)
  await seedUser(
    { id: "u_sneha", name: "Sneha Patel", upiVpa: "sneha@paytm", kycStatus: "VERIFIED", createdAt: new Date(Date.now() - 15 * 86400000).toISOString() },
    [{ lenderId: "lender_dmi", limit: 5000, utilized: 0 }],
    [],
  );

  // User 5: Vikram Das — inconsistent, one late (LOW risk)
  await seedUser(
    { id: "u_vikram", name: "Vikram Das", upiVpa: "vikram@ibl", kycStatus: "VERIFIED", createdAt: new Date(Date.now() - 120 * 86400000).toISOString() },
    [{ lenderId: "lender_axis", limit: 12000, utilized: 9500 }, { lenderId: "lender_dmi", limit: 8000, utilized: 6000 }],
    [
      { daysAgo: 90, merchant: "Zomato", amount: 900, status: "SETTLED" },
      { daysAgo: 75, merchant: "Flipkart", amount: 4000, status: "SETTLED" },
      { daysAgo: 60, merchant: "Petrol bunk", amount: 2000, status: "SETTLED" },
      { daysAgo: 45, merchant: "Amazon", amount: 6500, status: "SETTLED" },
      { daysAgo: 30, merchant: "Repayment (partial)", amount: 3000, status: "SETTLED" },
      { daysAgo: 10, merchant: "Swiggy", amount: 450, status: "SETTLED" },
    ],
  );
  // Vikram has a late streak reset
  await kv.set("streak:u_vikram", { userId: "u_vikram", consecutiveOnTime: 1, consecutiveFullPayment: 0, lastLateAt: new Date(Date.now() - 30 * 86400000).toISOString(), updatedAt: now() });

  return c.json({ message: "Seeded 5 demo users", users: ["u_priya", "u_arjun", "u_rahul", "u_sneha", "u_vikram"] });
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get(`${P}/health`, (c) => c.json({ status: "ok" }));

Deno.serve(app.fetch);
