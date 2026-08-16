import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import * as kv from "./kv_store.tsx";

const app = new Hono();
const P = "/make-server-f415469b";

app.use("/*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }));

// ── Types ─────────────────────────────────────────────────────────────────────

type LimitTier = "INSUFFICIENT_DATA" | "LOW" | "MEDIUM" | "HIGH";
type TxStatus = "INITIATED" | "PENDING_CONFIRMATION" | "SETTLED" | "CANCELLED" | "EXPIRED_AUTO_SETTLED";
type TxMode = "OWN_MONEY" | "CREDIT_LINE";
type TxChannel = "UPI" | "BNPL";
type ConsentStatus = "ACTIVE" | "REVOKED";
type ClStatus = "ACTIVE" | "SUSPENDED";
type KycStatus = "UNVERIFIED" | "SIMULATED_VERIFIED";
type NotifType = "OTP_SENT" | "KYC_VERIFIED" | "TX_SETTLED" | "TX_DECLINED" | "TX_CANCELLED" | "LIMIT_INCREASED" | "LIMIT_PROPOSAL" | "STATEMENT_GENERATED" | "CONSENT_GRANTED" | "GRIEVANCE_RAISED" | "GRIEVANCE_RESOLVED" | "COOLING_OFF_EXIT" | "MANDATE_SET";

interface User { id: string; phone: string; phoneVerifiedAt?: string; name: string; panNumberMasked?: string; kycStatus: KycStatus; upiVpa: string; createdAt: string; role?: "USER" | "ADMIN" }
interface Lender { id: string; name: string; type: "BANK" | "NBFC"; maxTxAmount: number; priority: number }
interface CreditLine { id: string; userId: string; lenderId: string; lenderName: string; limit: number; utilized: number; heldAmount: number; status: ClStatus; interestRate: number; coolingOffExpiresAt?: string; firstSpentAt?: string }
interface LimitProposal { id: string; userId: string; creditLineId: string; currentLimit: number; proposedLimit: number; reason: string; status: "PENDING" | "ACCEPTED" | "DECLINED"; createdAt: string; resolvedAt?: string }
interface KeyFactStatement { id: string; creditLineId: string; apr: number; totalInterestIfMaxUtilized: number; allFees: { name: string; amount: number; description: string }[]; recoveryTermsSummary: string; coolingOffDays: number; generatedAt: string }
interface GrievanceTicket { id: string; userId: string; category: string; description: string; status: "OPEN" | "IN_PROGRESS" | "RESOLVED"; createdAt: string; resolvedAt?: string; resolution?: string }
interface RepaymentMandate { id: string; userId: string; creditLineId: string; type: "FULL" | "MINIMUM"; active: boolean; createdAt: string }
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
interface OtpChallenge { id: string; phone: string; codeHash: string; expiresAt: string; attempts: number; verifiedAt?: string; purpose: "SIGNUP" | "LOGIN" }
interface Session { id: string; userId: string; tokenHash: string; createdAt: string; expiresAt: string; revokedAt?: string }
interface Notification { id: string; userId: string; type: NotifType; title: string; body: string; stampStatus: string; createdAt: string; readAt?: string }

// ── Lender configs ────────────────────────────────────────────────────────────

interface LenderConfig { id: string; name: string; type: "BANK" | "NBFC"; maxTxAmount: number; priority: number; approves: (amount: number, available: number) => { ok: boolean; reason: string } }

const LENDER_CONFIGS: LenderConfig[] = [
  { id: "lender_axis", name: "Axis Bank", type: "BANK", maxTxAmount: 20000, priority: 1, approves: (amount, available) => amount > 20000 ? { ok: false, reason: "Single transaction exceeds ₹20,000 Axis Bank cap" } : amount > available ? { ok: false, reason: "Insufficient available limit on Axis Bank line" } : { ok: true, reason: "Approved" } },
  { id: "lender_dmi", name: "DMI Finance", type: "NBFC", maxTxAmount: 15000, priority: 2, approves: (amount, available) => amount > 15000 ? { ok: false, reason: "Single transaction exceeds ₹15,000 DMI Finance cap" } : amount > available ? { ok: false, reason: "Insufficient available limit on DMI Finance line" } : { ok: true, reason: "Approved" } },
];

// ── Crypto utilities ──────────────────────────────────────────────────────────

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateOtp(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function maskPan(pan: string): string {
  return pan.length >= 10 ? pan.slice(0, 5) + "****" + pan.slice(-1) : pan;
}

// ── General utilities ─────────────────────────────────────────────────────────

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

async function audit(actorId: string, action: string, entityType: string, entityId: string, reason: string) {
  const entry: AuditLog = { id: uid(), actorId, action, entityType, entityId, reason, createdAt: now() };
  const perUser: AuditLog[] = await kv.get(`audit:u:${actorId}`) ?? [];
  await kv.set(`audit:u:${actorId}`, [entry, ...perUser].slice(0, 200));
  const all: AuditLog[] = await kv.get("audit:all") ?? [];
  await kv.set("audit:all", [entry, ...all].slice(0, 500));
}

async function notify(userId: string, type: NotifType, title: string, body: string, stampStatus = "settled") {
  const n: Notification = { id: uid(), userId, type, title, body, stampStatus, createdAt: now() };
  const list: Notification[] = await kv.get(`notifications:u:${userId}`) ?? [];
  await kv.set(`notifications:u:${userId}`, [n, ...list].slice(0, 50));
}

async function updateInList<T extends { id: string }>(key: string, item: T): Promise<void> {
  const list: T[] = await kv.get(key) ?? [];
  const idx = list.findIndex(x => x.id === item.id);
  if (idx >= 0) list[idx] = item; else list.unshift(item);
  await kv.set(key, list);
}

async function prependToList<T>(key: string, item: T): Promise<void> {
  const list: T[] = await kv.get(key) ?? [];
  await kv.set(key, [item, ...list]);
}

async function saveTransaction(tx: Transaction): Promise<void> {
  await Promise.all([kv.set(`transaction:${tx.id}`, tx), updateInList(`transactions:u:${tx.userId}`, tx), updateInList(`transactions:cl:${tx.creditLineId}`, tx)]);
}

async function getCreditLine(clId: string): Promise<CreditLine | null> { return await kv.get(`credit_line:${clId}`); }

async function saveCreditLine(cl: CreditLine): Promise<void> {
  await kv.set(`credit_line:${cl.id}`, cl);
  await updateInList(`credit_lines:u:${cl.userId}`, cl);
}

function currentPeriod(): { start: string; end: string; due: string } {
  const d = new Date();
  return { start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(), end: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString(), due: new Date(d.getFullYear(), d.getMonth() + 1, 5).toISOString() };
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
  const item: StatementLineItem = { id: uid(), statementId: stmt.id, transactionId: tx.id, lenderId: tx.lenderId, lenderName: cl.lenderName, amount: tx.amount, description: tx.merchantName, date: tx.settledAt ?? now() };
  const items: StatementLineItem[] = await kv.get(`stmt_items:${stmt.id}`) ?? [];
  items.push(item);
  const total = items.reduce((s, i) => s + i.amount, 0);
  const updated: Statement = { ...stmt, totalDue: total, minimumDue: Math.ceil(total * 0.05) };
  await kv.set(`stmt_items:${stmt.id}`, items);
  await kv.set(`statement:${stmt.id}`, updated);
  await kv.set(`stmt:open:${tx.userId}`, updated);
  await updateInList(`statements:u:${tx.userId}`, updated);
}

// ── Rate limiter (real, not simulated) ────────────────────────────────────────

async function checkRateLimit(key: string, maxCount: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const data: { count: number; windowStart: number } = await kv.get(`rate:${key}`) ?? { count: 0, windowStart: Date.now() };
  const elapsed = Date.now() - data.windowStart;
  if (elapsed > windowMs) {
    await kv.set(`rate:${key}`, { count: 1, windowStart: Date.now() });
    return { allowed: true };
  }
  if (data.count >= maxCount) {
    return { allowed: false, retryAfterSeconds: Math.ceil((windowMs - elapsed) / 1000) };
  }
  await kv.set(`rate:${key}`, { count: data.count + 1, windowStart: data.windowStart });
  return { allowed: true };
}

// ── Auth middleware ───────────────────────────────────────────────────────────

const PUBLIC_PATHS = ["/auth/", "/health", "/seed", "/demo/login-as"];

app.use(`${P}/*`, async (c, next) => {
  const path = c.req.path;
  const isPublic = PUBLIC_PATHS.some(p => path.includes(p));
  if (isPublic) return next();

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } }, 401);
  }
  const token = authHeader.slice(7);
  const tokenHash = await sha256(token);
  const session: Session | null = await kv.get(`session:${tokenHash}`);
  if (!session || session.revokedAt || new Date(session.expiresAt) < new Date()) {
    return c.json({ error: { code: "SESSION_EXPIRED", message: "Session expired. Please log in again." } }, 401);
  }
  c.set("userId", session.userId);
  return next();
});

// ── Module: Auth ──────────────────────────────────────────────────────────────

app.post(`${P}/auth/otp/request`, async (c) => {
  const { phone, purpose = "LOGIN" } = await c.req.json();
  if (!phone || !/^(\+91)?[6-9]\d{9}$/.test(phone.replace(/\s/g, ""))) {
    return c.json({ error: { code: "INVALID_PHONE", message: "Enter a valid 10-digit Indian mobile number" } }, 400);
  }
  const normalised = phone.startsWith("+91") ? phone : `+91${phone.replace(/^0/, "")}`;

  // Rate limit: 3 OTP requests per phone per 10 minutes
  const rl = await checkRateLimit(`otp:req:${normalised}`, 3, 10 * 60 * 1000);
  if (!rl.allowed) {
    return c.json({ error: { code: "RATE_LIMITED", message: `Too many requests. Try again in ${Math.ceil((rl.retryAfterSeconds ?? 60) / 60)} minute(s).`, retryAfterSeconds: rl.retryAfterSeconds } }, 429);
  }

  const otp = generateOtp();
  const codeHash = await sha256(otp);
  const challenge: OtpChallenge = { id: uid(), phone: normalised, codeHash, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), attempts: 0, purpose: purpose as "SIGNUP" | "LOGIN" };
  await kv.set(`otp:${normalised}`, challenge);

  // Lookup if user exists (to determine SIGNUP vs LOGIN automatically)
  const userId: string | null = await kv.get(`user:phone:${normalised}`);
  const isNewUser = !userId;

  // In demo mode: return OTP in response (never log to persistent store)
  // Label clearly — not production behaviour
  return c.json({ challengeId: challenge.id, expiresAt: challenge.expiresAt, isNewUser, demoOtp: otp, note: "DEMO MODE: OTP shown in response. In production this would be sent via SMS." });
});

app.post(`${P}/auth/otp/verify`, async (c) => {
  const { phone, otp, idempotencyKey } = await c.req.json();
  if (!phone || !otp) return c.json({ error: { code: "MISSING_FIELDS", message: "phone and otp are required" } }, 400);
  const normalised = phone.startsWith("+91") ? phone : `+91${phone.replace(/^0/, "")}`;

  // Idempotency check
  if (idempotencyKey) {
    const existing = await kv.get(`idem:otp:${idempotencyKey}`);
    if (existing) return c.json({ ...existing, idempotent: true });
  }

  // Rate limit OTP verify: 5 attempts per phone per 10 minutes
  const rl = await checkRateLimit(`otp:verify:${normalised}`, 5, 10 * 60 * 1000);
  if (!rl.allowed) {
    return c.json({ error: { code: "RATE_LIMITED", message: "Too many failed attempts. Request a new OTP." } }, 429);
  }

  const challenge: OtpChallenge | null = await kv.get(`otp:${normalised}`);
  if (!challenge) return c.json({ error: { code: "NO_CHALLENGE", message: "No OTP found for this number. Please request one." } }, 404);
  if (new Date(challenge.expiresAt) < new Date()) return c.json({ error: { code: "OTP_EXPIRED", message: "OTP has expired. Please request a new one." } }, 400);
  if (challenge.verifiedAt) return c.json({ error: { code: "ALREADY_USED", message: "This OTP has already been used." } }, 400);
  if (challenge.attempts >= 5) return c.json({ error: { code: "MAX_ATTEMPTS", message: "Maximum attempts exceeded. Request a new OTP." } }, 400);

  const inputHash = await sha256(otp);
  if (inputHash !== challenge.codeHash) {
    const updated = { ...challenge, attempts: challenge.attempts + 1 };
    await kv.set(`otp:${normalised}`, updated);
    const remaining = 5 - updated.attempts;
    return c.json({ error: { code: "INVALID_OTP", message: `Incorrect OTP. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` } }, 400);
  }

  // OTP verified — mark challenge used
  await kv.set(`otp:${normalised}`, { ...challenge, verifiedAt: now() });

  // Get or create user
  let userId: string | null = await kv.get(`user:phone:${normalised}`);
  let user: User | null = userId ? await kv.get(`user:${userId}`) : null;
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    userId = uid();
    user = { id: userId, phone: normalised, phoneVerifiedAt: now(), name: "", kycStatus: "UNVERIFIED", upiVpa: `user${userId.slice(0, 6)}@upi`, createdAt: now(), role: "USER" };
    await kv.set(`user:${userId}`, user);
    const allUsers: User[] = await kv.get("users") ?? [];
    await kv.set("users", [...allUsers, user]);
    await kv.set(`user:phone:${normalised}`, userId);
    await audit(userId, "USER_CREATED", "User", userId, `New user via phone ${normalised.slice(0, 6)}***`);
  } else {
    // Update phoneVerifiedAt on login
    user = { ...user, phoneVerifiedAt: now() };
    await kv.set(`user:${userId}`, user);
    await updateInList("users", user);
    await audit(userId, "USER_LOGIN", "User", userId, "Phone OTP login");
  }

  // Issue session (24 hours)
  const token = generateToken();
  const tokenHash = await sha256(token);
  const session: Session = { id: uid(), userId: userId!, tokenHash, createdAt: now(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
  await kv.set(`session:${tokenHash}`, session);

  if (idempotencyKey) await kv.set(`idem:otp:${idempotencyKey}`, { token, user, isNewUser, sessionId: session.id });

  await notify(userId!, "OTP_SENT", "Logged in", `Welcome${isNewUser ? " to ConsumptionCredit" : " back"}, ${user.phone}`, "granted");

  return c.json({ token, user: { ...user, panNumberMasked: user.panNumberMasked }, isNewUser, sessionId: session.id });
});

app.post(`${P}/auth/kyc/simulate-verify`, async (c) => {
  const userId = c.get("userId") as string;
  const { pan, name, dob } = await c.req.json();
  if (!pan || !name || !dob) return c.json({ error: { code: "MISSING_FIELDS", message: "pan, name and dob are required" } }, 400);

  // Validate PAN format: [A-Z]{5}[0-9]{4}[A-Z]{1}
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
    return c.json({ error: { code: "INVALID_PAN", message: "Invalid PAN format. Expected: ABCDE1234F" } }, 400);
  }

  const user: User | null = await kv.get(`user:${userId}`);
  if (!user) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);

  // NOTE: This is SIMULATED_VERIFIED — not real UIDAI/NSDL verification.
  // Real eKYC requires UIDAI AUA/KUA licensing not available for demo projects.
  const updated: User = { ...user, name, panNumberMasked: maskPan(pan), kycStatus: "SIMULATED_VERIFIED", upiVpa: `${name.split(" ")[0].toLowerCase()}@upi` };
  await kv.set(`user:${userId}`, updated);
  await updateInList("users", updated);
  await kv.set(`user:phone:${user.phone}`, userId);

  await audit(userId, "KYC_SIMULATED", "User", userId, "Simulated Aadhaar+PAN verification — NOT real UIDAI integration");
  await notify(userId, "KYC_VERIFIED", "KYC complete", "Simulated verification accepted. Your credit line can now be activated.", "granted");

  // Auto-run risk assessment and create starter credit lines
  const txHistory: Transaction[] = await kv.get(`transactions:u:${userId}`) ?? [];
  const { tier, limit, signals, composite } = computeRisk(txHistory);
  const ra: RiskAssessment = { id: uid(), userId, recommendedLimit: limit, tier, signals, compositeScore: composite, createdAt: now() };
  await kv.set(`risk_latest:${userId}`, ra);

  // Create starter credit lines
  const lenders: Lender[] = [
    { id: "lender_axis", name: "Axis Bank", type: "BANK", maxTxAmount: 20000, priority: 1 },
    { id: "lender_dmi", name: "DMI Finance", type: "NBFC", maxTxAmount: 15000, priority: 2 },
  ];
  const existingCls: CreditLine[] = await kv.get(`credit_lines:u:${userId}`) ?? [];
  if (existingCls.length === 0) {
    const axisLimit = Math.min(Math.round(limit * 0.6 / 1000) * 1000, 20000);
    const dmiLimit = Math.min(Math.round(limit * 0.4 / 1000) * 1000, 15000);
    const cls: CreditLine[] = [
      { id: `cl_${userId}_axis`, userId, lenderId: "lender_axis", lenderName: "Axis Bank", limit: axisLimit, utilized: 0, heldAmount: 0, status: "ACTIVE", interestRate: 0.015 },
      { id: `cl_${userId}_dmi`, userId, lenderId: "lender_dmi", lenderName: "DMI Finance", limit: dmiLimit, utilized: 0, heldAmount: 0, status: "ACTIVE", interestRate: 0.015 },
    ];
    for (const cl of cls) {
      await saveCreditLine(cl);
      const consent: ConsentRecord = { id: uid(), userId, creditLineId: cl.id, scope: "SPEND,REPAY,STATEMENT_VIEW", grantedAt: now(), expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(), status: "ACTIVE" };
      await kv.set(`consent:${consent.id}`, consent);
      await kv.set(`consent:active:${userId}:${cl.id}`, consent);
    }
    for (const l of lenders) await kv.set(`lender:${l.id}`, l);
    await kv.set("streak:" + userId, { userId, consecutiveOnTime: 0, consecutiveFullPayment: 0, updatedAt: now() });
    await notify(userId, "CONSENT_GRANTED", "Credit line ready", `₹${(axisLimit + dmiLimit).toLocaleString("en-IN")} across Axis Bank + DMI Finance. Start spending.`, "granted");
  }

  return c.json({ user: updated, riskAssessment: ra, note: "kycStatus: SIMULATED_VERIFIED — not real UIDAI verification" });
});

app.post(`${P}/auth/logout`, async (c) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const tokenHash = await sha256(authHeader.slice(7));
    const session: Session | null = await kv.get(`session:${tokenHash}`);
    if (session) {
      await kv.set(`session:${tokenHash}`, { ...session, revokedAt: now() });
      await audit(session.userId, "SESSION_REVOKED", "Session", session.id, "User logout");
    }
  }
  return c.json({ success: true });
});

app.get(`${P}/auth/me`, async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: { code: "UNAUTHENTICATED", message: "No session" } }, 401);
  const tokenHash = await sha256(authHeader.slice(7));
  const session: Session | null = await kv.get(`session:${tokenHash}`);
  if (!session || session.revokedAt || new Date(session.expiresAt) < new Date()) return c.json({ error: { code: "SESSION_EXPIRED", message: "Session expired" } }, 401);
  const user: User | null = await kv.get(`user:${session.userId}`);
  if (!user) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  return c.json({ user, sessionId: session.id, expiresAt: session.expiresAt });
});

// ── Module 1: Risk Engine ─────────────────────────────────────────────────────

function computeRisk(txHistory: Transaction[]): { tier: LimitTier; limit: number; signals: RiskSignal[]; composite: number } {
  const recent = txHistory.filter(t => Date.now() - new Date(t.createdAt).getTime() < 90 * 86400000);
  const freq = Math.min(recent.length, 30);
  const amounts = recent.map(t => t.amount);
  const avgTicket = amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const uniqueMerchants = new Set(recent.map(t => t.merchantName)).size;
  const settled = txHistory.filter(t => t.status === "SETTLED").length;
  const regularity = txHistory.length > 0 ? (settled / txHistory.length) * 100 : 0;
  const ageDays = txHistory.length > 0 ? (Date.now() - new Date(txHistory[txHistory.length - 1].createdAt).getTime()) / 86400000 : 0;
  const signals: RiskSignal[] = [
    { name: "transactionFrequency", weight: 0.25, score: (freq / 30) * 100, description: `${freq} transactions in last 90 days` },
    { name: "averageTicketSize", weight: 0.20, score: Math.min((avgTicket / 5000) * 100, 100), description: `Avg ₹${Math.round(avgTicket).toLocaleString("en-IN")} per transaction` },
    { name: "merchantDiversity", weight: 0.20, score: Math.min((uniqueMerchants / 8) * 100, 100), description: `${uniqueMerchants} unique merchants` },
    { name: "paymentRegularity", weight: 0.25, score: regularity, description: `${Math.round(regularity)}% settlement rate` },
    { name: "accountAge", weight: 0.10, score: Math.min((ageDays / 180) * 100, 100), description: `${Math.round(ageDays)} days history` },
  ];
  const composite = signals.reduce((acc, s) => acc + s.score * s.weight, 0);
  if (txHistory.length < 2) return { tier: "INSUFFICIENT_DATA", limit: 5000, signals, composite };
  if (composite < 30) return { tier: "LOW", limit: Math.round((10000 + composite * 200) / 1000) * 1000, signals, composite };
  if (composite < 55) return { tier: "MEDIUM", limit: Math.round((20000 + composite * 300) / 1000) * 1000, signals, composite };
  return { tier: "HIGH", limit: Math.min(Math.round((40000 + composite * 600) / 1000) * 1000, 100000), signals, composite };
}

app.post(`${P}/risk/assess`, async (c) => {
  const userId = c.get("userId") as string;
  const txHistory: Transaction[] = await kv.get(`transactions:u:${userId}`) ?? [];
  const { tier, limit, signals, composite } = computeRisk(txHistory);
  const ra: RiskAssessment = { id: uid(), userId, recommendedLimit: limit, tier, signals, compositeScore: composite, createdAt: now() };
  await kv.set(`risk_latest:${userId}`, ra);
  await audit(userId, "RISK_ASSESSED", "RiskAssessment", ra.id, `Tier: ${tier}, Limit: ₹${limit}`);
  return c.json(ra);
});

// ── Module 2: Consent ─────────────────────────────────────────────────────────

app.post(`${P}/consent/grant`, async (c) => {
  const userId = c.get("userId") as string;
  const { creditLineId } = await c.req.json();
  if (!creditLineId) return c.json({ error: { code: "MISSING_FIELDS", message: "creditLineId required" } }, 400);
  const cl = await getCreditLine(creditLineId);
  if (!cl) return c.json({ error: { code: "NOT_FOUND", message: "Credit line not found" } }, 404);
  if (cl.userId !== userId) return c.json({ error: { code: "FORBIDDEN", message: "Credit line does not belong to you" } }, 403);
  const expires = new Date(Date.now() + 365 * 86400000).toISOString();
  const consent: ConsentRecord = { id: uid(), userId, creditLineId, scope: "SPEND,REPAY,STATEMENT_VIEW", grantedAt: now(), expiresAt: expires, status: "ACTIVE" };
  await kv.set(`consent:${consent.id}`, consent);
  await kv.set(`consent:active:${userId}:${creditLineId}`, consent);
  await audit(userId, "CONSENT_GRANTED", "ConsentRecord", consent.id, `Scope: ${consent.scope}`);
  await notify(userId, "CONSENT_GRANTED", "Consent granted", `You can now spend from your ${cl.lenderName} credit line.`, "granted");
  return c.json(consent);
});

app.post(`${P}/consent/revoke`, async (c) => {
  const userId = c.get("userId") as string;
  const { creditLineId } = await c.req.json();
  const consent: ConsentRecord | null = await kv.get(`consent:active:${userId}:${creditLineId}`);
  if (!consent) return c.json({ error: { code: "NOT_FOUND", message: "No active consent found" } }, 404);
  const revoked: ConsentRecord = { ...consent, revokedAt: now(), status: "REVOKED" };
  await kv.set(`consent:${consent.id}`, revoked);
  await kv.set(`consent:active:${userId}:${creditLineId}`, revoked);
  await audit(userId, "CONSENT_REVOKED", "ConsentRecord", consent.id, "User initiated revocation");
  return c.json(revoked);
});

app.get(`${P}/consent/check`, async (c) => {
  const sessionUserId = c.get("userId") as string;
  const creditLineId = c.req.query("creditLineId");
  if (!creditLineId) return c.json({ valid: false, reason: "Missing creditLineId" });
  const consent: ConsentRecord | null = await kv.get(`consent:active:${sessionUserId}:${creditLineId}`);
  if (!consent) return c.json({ valid: false, reason: "No consent record found" });
  if (consent.status !== "ACTIVE") return c.json({ valid: false, reason: "Consent has been revoked" });
  if (new Date(consent.expiresAt) < new Date()) return c.json({ valid: false, reason: "Consent has expired" });
  return c.json({ valid: true, consent });
});

// ── Module 3: Enforcement ─────────────────────────────────────────────────────

app.post(`${P}/enforce`, async (c) => {
  const userId = c.get("userId") as string;
  const { creditLineId, amount, channel } = await c.req.json();
  if (!creditLineId || !amount) return c.json({ approved: false, reason: "Incomplete request" });
  const [consentRes, cl] = await Promise.all([kv.get(`consent:active:${userId}:${creditLineId}`) as Promise<ConsentRecord | null>, getCreditLine(creditLineId)]);
  if (!consentRes || consentRes.status !== "ACTIVE") return c.json({ approved: false, reason: "No valid consent for this credit line" });
  if (new Date(consentRes.expiresAt) < new Date()) return c.json({ approved: false, reason: "Consent expired" });
  if (!cl) return c.json({ approved: false, reason: "Credit line not found" });
  if (cl.status !== "ACTIVE") return c.json({ approved: false, reason: "Credit line is suspended" });
  if (cl.userId !== userId) return c.json({ approved: false, reason: "Credit line mismatch" });
  const available = cl.limit - cl.utilized - cl.heldAmount;
  if (amount > available) return c.json({ approved: false, reason: "Limit reached for this cycle. Repay early to free up room.", available });
  if (channel === "BNPL" && amount < 500) return c.json({ approved: false, reason: "BNPL minimum is ₹500" });
  return c.json({ approved: true, available, cl });
});

// ── Module 4: Settlement ──────────────────────────────────────────────────────

app.post(`${P}/settlement/initiate`, async (c) => {
  const userId = c.get("userId") as string;
  const { creditLineId, amount, merchantName, mode, channel, idempotencyKey } = await c.req.json();
  if (!creditLineId || !amount || !merchantName) return c.json({ error: { code: "MISSING_FIELDS", message: "Missing required fields" } }, 400);
  if (idempotencyKey) {
    const existing = await kv.get(`idem:${idempotencyKey}`);
    if (existing) return c.json({ ...existing, idempotent: true });
  }
  const cl = await getCreditLine(creditLineId);
  if (!cl) return c.json({ error: { code: "NOT_FOUND", message: "Credit line not found" } }, 404);
  if (cl.userId !== userId) return c.json({ error: { code: "FORBIDDEN", message: "Credit line mismatch" } }, 403);
  const isLarge = amount > 10000;
  const txStatus: TxStatus = isLarge ? "PENDING_CONFIRMATION" : "SETTLED";
  const ts = now();
  const tx: Transaction = { id: uid(), userId, creditLineId, lenderId: cl.lenderId, merchantName, amount, mode: mode ?? "CREDIT_LINE", channel: channel ?? "UPI", status: txStatus, idempotencyKey, pendingSince: isLarge ? ts : undefined, settledAt: isLarge ? undefined : ts, createdAt: ts };
  const firstSpentAt = cl.firstSpentAt ?? now();
  if (isLarge) await saveCreditLine({ ...cl, heldAmount: cl.heldAmount + amount, firstSpentAt });
  else { await saveCreditLine({ ...cl, utilized: cl.utilized + amount, firstSpentAt }); await appendLineItem(tx, cl); }
  await saveTransaction(tx);
  if (idempotencyKey) await kv.set(`idem:${idempotencyKey}`, tx);
  await audit(userId, "TRANSACTION_INITIATED", "Transaction", tx.id, `${txStatus}: ₹${amount} at ${merchantName}`);
  if (!isLarge) await notify(userId, "TX_SETTLED", "Payment settled", `₹${amount.toLocaleString("en-IN")} to ${merchantName} via ${cl.lenderName}.`, "settled");
  return c.json(tx);
});

app.post(`${P}/settlement/confirm`, async (c) => {
  const userId = c.get("userId") as string;
  const { transactionId } = await c.req.json();
  const tx: Transaction | null = await kv.get(`transaction:${transactionId}`);
  if (!tx) return c.json({ error: { code: "NOT_FOUND", message: "Transaction not found" } }, 404);
  if (tx.userId !== userId) return c.json({ error: { code: "FORBIDDEN", message: "Transaction does not belong to you" } }, 403);
  if (tx.status !== "PENDING_CONFIRMATION") return c.json({ error: { code: "INVALID_STATE", message: `Cannot confirm transaction in status ${tx.status}` } }, 400);
  const cl = await getCreditLine(tx.creditLineId);
  if (!cl) return c.json({ error: { code: "NOT_FOUND", message: "Credit line not found" } }, 404);
  const settled: Transaction = { ...tx, status: "SETTLED", settledAt: now() };
  await saveCreditLine({ ...cl, utilized: cl.utilized + tx.amount, heldAmount: Math.max(0, cl.heldAmount - tx.amount) });
  await saveTransaction(settled);
  await appendLineItem(settled, cl);
  await audit(userId, "TRANSACTION_SETTLED", "Transaction", tx.id, "Manual confirm");
  await notify(userId, "TX_SETTLED", "Payment confirmed", `₹${tx.amount.toLocaleString("en-IN")} to ${tx.merchantName} is settled.`, "settled");
  return c.json(settled);
});

app.post(`${P}/settlement/cancel`, async (c) => {
  const userId = c.get("userId") as string;
  const { transactionId } = await c.req.json();
  const tx: Transaction | null = await kv.get(`transaction:${transactionId}`);
  if (!tx) return c.json({ error: { code: "NOT_FOUND", message: "Transaction not found" } }, 404);
  if (tx.userId !== userId) return c.json({ error: { code: "FORBIDDEN", message: "Transaction does not belong to you" } }, 403);
  if (tx.status !== "PENDING_CONFIRMATION") return c.json({ error: { code: "INVALID_STATE", message: `Cannot cancel transaction in status ${tx.status}` } }, 400);
  const cl = await getCreditLine(tx.creditLineId);
  if (!cl) return c.json({ error: { code: "NOT_FOUND", message: "Credit line not found" } }, 404);
  const cancelled: Transaction = { ...tx, status: "CANCELLED", cancelledAt: now() };
  await saveCreditLine({ ...cl, heldAmount: Math.max(0, cl.heldAmount - tx.amount) });
  await saveTransaction(cancelled);
  await audit(userId, "TRANSACTION_CANCELLED", "Transaction", tx.id, "User cancelled during hold window");
  await notify(userId, "TX_CANCELLED", "Payment cancelled", `₹${tx.amount.toLocaleString("en-IN")} hold to ${tx.merchantName} has been released.`, "declined");
  return c.json(cancelled);
});

app.post(`${P}/settlement/auto-settle`, async (c) => {
  const userId = c.get("userId") as string;
  const txs: Transaction[] = await kv.get(`transactions:u:${userId}`) ?? [];
  const cutoff = Date.now() - 3600000;
  const toSettle = txs.filter(t => t.status === "PENDING_CONFIRMATION" && t.pendingSince && new Date(t.pendingSince).getTime() < cutoff);
  const results: Transaction[] = [];
  for (const tx of toSettle) {
    const cl = await getCreditLine(tx.creditLineId);
    if (!cl) continue;
    const settled: Transaction = { ...tx, status: "EXPIRED_AUTO_SETTLED", settledAt: now() };
    await saveCreditLine({ ...cl, utilized: cl.utilized + tx.amount, heldAmount: Math.max(0, cl.heldAmount - tx.amount) });
    await saveTransaction(settled);
    await appendLineItem(settled, cl);
    await audit(userId, "TRANSACTION_AUTO_SETTLED", "Transaction", tx.id, "1-hour hold expired");
    results.push(settled);
  }
  return c.json({ settled: results.length, transactions: results });
});

// ── Module 5: Routing ─────────────────────────────────────────────────────────

app.post(`${P}/route`, async (c) => {
  const userId = c.get("userId") as string;
  const { amount } = await c.req.json();
  if (!amount) return c.json({ error: { code: "MISSING_FIELDS", message: "amount required" } }, 400);
  const creditLines: CreditLine[] = await kv.get(`credit_lines:u:${userId}`) ?? [];
  const sorted = creditLines.filter(cl => cl.status === "ACTIVE").sort((a, b) => (LENDER_CONFIGS.find(l => l.id === a.lenderId)?.priority ?? 99) - (LENDER_CONFIGS.find(l => l.id === b.lenderId)?.priority ?? 99));
  const attempts: RoutingAttempt[] = [];
  for (const cl of sorted) {
    const config = LENDER_CONFIGS.find(l => l.id === cl.lenderId);
    if (!config) continue;
    const available = cl.limit - cl.utilized - cl.heldAmount;
    const result = config.approves(amount, available);
    attempts.push({ lenderId: cl.lenderId, lenderName: cl.lenderName, approved: result.ok, reason: result.reason, at: now() });
    if (result.ok) {
      await audit(userId, "ROUTE_APPROVED", "CreditLine", cl.id, `Routed ₹${amount} via ${cl.lenderName}${attempts.length > 1 ? ` (after ${attempts.length - 1} fallback)` : ""}`);
      return c.json({ approved: true, creditLine: cl, attempts });
    }
  }
  await audit(userId, "ROUTE_DECLINED", "User", userId, `All ${attempts.length} lenders declined ₹${amount}`);
  return c.json({ approved: false, attempts, reason: attempts[attempts.length - 1]?.reason ?? "No eligible lender" });
});

// ── Module 6: Billing ─────────────────────────────────────────────────────────

app.post(`${P}/billing/repay`, async (c) => {
  const userId = c.get("userId") as string;
  const { amount } = await c.req.json();
  if (!amount) return c.json({ error: { code: "MISSING_FIELDS", message: "amount required" } }, 400);
  const stmt: Statement | null = await kv.get(`stmt:open:${userId}`);
  if (!stmt) return c.json({ error: { code: "NOT_FOUND", message: "No open statement" } }, 404);
  const items: StatementLineItem[] = await kv.get(`stmt_items:${stmt.id}`) ?? [];
  const lenderTotals: Record<string, { lenderName: string; total: number }> = {};
  for (const item of items) {
    if (!lenderTotals[item.lenderId]) lenderTotals[item.lenderId] = { lenderName: item.lenderName, total: 0 };
    lenderTotals[item.lenderId].total += item.amount;
  }
  const grandTotal = Object.values(lenderTotals).reduce((s, v) => s + v.total, 0);
  const allocation: Record<string, number> = {};
  let remaining = amount;
  const entries = Object.entries(lenderTotals);
  for (let i = 0; i < entries.length; i++) {
    const [lid, info] = entries[i];
    const share = i === entries.length - 1 ? remaining : Math.round((info.total / grandTotal) * amount);
    allocation[lid] = share;
    remaining -= share;
  }
  const cls: CreditLine[] = await kv.get(`credit_lines:u:${userId}`) ?? [];
  for (const [lid, repaid] of Object.entries(allocation)) {
    const cl = cls.find(c => c.lenderId === lid);
    if (cl) await saveCreditLine({ ...cl, utilized: Math.max(0, cl.utilized - repaid) });
  }
  const isFullRepayment = amount >= stmt.totalDue;
  const newTotal = Math.max(0, stmt.totalDue - amount);
  const updatedStmt: Statement = { ...stmt, totalDue: newTotal, minimumDue: Math.ceil(newTotal * 0.05), status: newTotal <= 0 ? "PAID" : "OPEN" };
  await kv.set(`statement:${stmt.id}`, updatedStmt);
  await kv.set(`stmt:open:${userId}`, updatedStmt);
  await updateInList(`statements:u:${userId}`, updatedStmt);
  await audit(userId, "REPAYMENT_RECORDED", "Statement", stmt.id, `₹${amount} repaid. Allocation: ${JSON.stringify(allocation)}`);
  await notify(userId, "TX_SETTLED", "Repayment received", `₹${amount.toLocaleString("en-IN")} applied to your credit lines.`, "settled");
  const growthResult = await checkLimitGrowth(userId, isFullRepayment, false);
  return c.json({ success: true, allocation, updatedStatement: updatedStmt, limitGrowth: growthResult });
});

// ── Module 7: Limit Growth ────────────────────────────────────────────────────

async function checkLimitGrowth(userId: string, wasOnTime: boolean, wasLate: boolean): Promise<any> {
  let streak: RepaymentStreak = await kv.get(`streak:${userId}`) ?? { userId, consecutiveOnTime: 0, consecutiveFullPayment: 0, updatedAt: now() };
  if (wasLate) { streak = { ...streak, consecutiveOnTime: 0, consecutiveFullPayment: 0, lastLateAt: now(), updatedAt: now() }; await kv.set(`streak:${userId}`, streak); return null; }
  streak = { ...streak, consecutiveOnTime: streak.consecutiveOnTime + 1, consecutiveFullPayment: wasOnTime ? streak.consecutiveFullPayment + 1 : 0, updatedAt: now() };
  await kv.set(`streak:${userId}`, streak);
  if (streak.consecutiveOnTime >= 4) {
    const txHistory: Transaction[] = await kv.get(`transactions:u:${userId}`) ?? [];
    const { limit } = computeRisk(txHistory);
    const creditLines: CreditLine[] = await kv.get(`credit_lines:u:${userId}`) ?? [];
    const proposals: LimitProposal[] = [];
    for (const cl of creditLines.filter(c => c.status === "ACTIVE")) {
      // RBI: do not increase limit without explicit consent — create proposal instead
      const existingPending: LimitProposal | null = await kv.get(`limit_proposal:pending:${cl.id}`);
      if (existingPending) continue; // already has pending proposal
      const proportion = cl.limit / (creditLines.reduce((s, c) => s + c.limit, 1));
      const proposedLimit = Math.round(Math.min(cl.limit * 1.3, limit * proportion) / 1000) * 1000;
      if (proposedLimit > cl.limit) {
        const reason = `${streak.consecutiveOnTime} consecutive on-time repayments`;
        const proposal: LimitProposal = { id: uid(), userId, creditLineId: cl.id, currentLimit: cl.limit, proposedLimit, reason, status: "PENDING", createdAt: now() };
        await kv.set(`limit_proposal:${proposal.id}`, proposal);
        await kv.set(`limit_proposal:pending:${cl.id}`, proposal);
        const userProposals: LimitProposal[] = await kv.get(`limit_proposals:u:${userId}`) ?? [];
        await kv.set(`limit_proposals:u:${userId}`, [proposal, ...userProposals]);
        await audit(userId, "LIMIT_PROPOSAL_CREATED", "LimitProposal", proposal.id, `Proposed ₹${cl.limit} → ₹${proposedLimit}. ${reason}`);
        proposals.push(proposal);
      }
    }
    if (proposals.length > 0) {
      await notify(userId, "LIMIT_PROPOSAL", "Limit increase available", `You qualify for a higher credit limit. Tap to review and accept.`, "grown");
      return { triggered: true, proposals };
    }
  }
  return { triggered: false, streak };
}

// ── Module 8: BNPL ────────────────────────────────────────────────────────────

app.post(`${P}/bnpl/plans`, async (c) => {
  const userId = c.get("userId") as string;
  const { creditLineId, amount } = await c.req.json();
  if (!creditLineId || !amount) return c.json({ error: { code: "MISSING_FIELDS", message: "Missing required fields" } }, 400);
  const cl = await getCreditLine(creditLineId);
  if (!cl || cl.userId !== userId) return c.json({ error: { code: "NOT_FOUND", message: "Credit line not found" } }, 404);
  const available = cl.limit - cl.utilized - cl.heldAmount;
  if (amount > available) return c.json({ error: { code: "INSUFFICIENT_LIMIT", message: "Insufficient limit for BNPL", available } }, 400);
  const monthlyRate = cl.interestRate / 12;
  const plans = [2, 3, 4].map(n => {
    const interest = Math.round(amount * monthlyRate * n);
    const total = amount + interest;
    const perInstallment = Math.ceil(total / n);
    return { installments: n, perInstallment, total, interest, monthlyRate, schedule: Array.from({ length: n }).map((_, i) => { const d = new Date(); d.setMonth(d.getMonth() + i + 1, 5); return { seq: i + 1, dueDate: d.toISOString(), amount: perInstallment }; }) };
  });
  return c.json({ plans, amount, available });
});

app.post(`${P}/bnpl/create-schedule`, async (c) => {
  const userId = c.get("userId") as string;
  const { creditLineId, amount, merchantName, installments, idempotencyKey } = await c.req.json();
  const cl = await getCreditLine(creditLineId);
  if (!cl || cl.userId !== userId) return c.json({ error: { code: "NOT_FOUND", message: "Credit line not found" } }, 404);
  const monthlyRate = cl.interestRate / 12;
  const interest = Math.round(amount * monthlyRate * installments);
  const perInstallment = Math.ceil((amount + interest) / installments);
  const tx: Transaction = { id: uid(), userId, creditLineId, lenderId: cl.lenderId, merchantName, amount, mode: "CREDIT_LINE", channel: "BNPL", status: "SETTLED", settledAt: now(), idempotencyKey, createdAt: now() };
  await saveCreditLine({ ...cl, utilized: cl.utilized + amount });
  const schedule: InstallmentItem[] = Array.from({ length: installments }).map((_, i) => { const d = new Date(); d.setMonth(d.getMonth() + i + 1, 5); return { seq: i + 1, dueDate: d.toISOString(), amount: perInstallment, status: "SCHEDULED" }; });
  const instSchedule: InstallmentSchedule = { id: uid(), transactionId: tx.id, userId, creditLineId, installments: schedule };
  await kv.set(`installment:${instSchedule.id}`, instSchedule);
  await kv.set(`installment:tx:${tx.id}`, instSchedule);
  await saveTransaction(tx);
  await appendLineItem(tx, cl);
  await audit(userId, "BNPL_CREATED", "Transaction", tx.id, `₹${amount} BNPL over ${installments} installments at ${merchantName}`);
  await notify(userId, "TX_SETTLED", "BNPL created", `₹${amount.toLocaleString("en-IN")} split into ${installments} × ₹${perInstallment.toLocaleString("en-IN")} at ${merchantName}.`, "settled");
  return c.json({ transaction: tx, schedule: instSchedule });
});

// ── Data queries ──────────────────────────────────────────────────────────────

app.get(`${P}/users`, async (c) => {
  const sessionUserId = c.get("userId") as string;
  const sessionUser: User | null = await kv.get(`user:${sessionUserId}`);
  const allUsers: User[] = await kv.get("users") ?? [];
  // Only admins see all users; regular users see only themselves
  if (sessionUser?.role === "ADMIN") return c.json(allUsers);
  return c.json(allUsers); // For demo: allow all (would restrict in production)
});

app.get(`${P}/users/:id/dashboard`, async (c) => {
  const sessionUserId = c.get("userId") as string;
  const requestedId = c.req.param("id");
  const user: User | null = await kv.get(`user:${requestedId}`);
  if (!user) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  if (requestedId !== sessionUserId) return c.json({ error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
  const [creditLines, txs, openStmt, risk, streak] = await Promise.all([
    kv.get(`credit_lines:u:${sessionUserId}`) as Promise<CreditLine[] | null>,
    kv.get(`transactions:u:${sessionUserId}`) as Promise<Transaction[] | null>,
    kv.get(`stmt:open:${sessionUserId}`) as Promise<Statement | null>,
    kv.get(`risk_latest:${sessionUserId}`) as Promise<RiskAssessment | null>,
    kv.get(`streak:${sessionUserId}`) as Promise<RepaymentStreak | null>,
  ]);
  const audits: AuditLog[] = await kv.get(`audit:u:${sessionUserId}`) ?? [];
  const recentGrowth = audits.find(a => a.action === "LIMIT_PROPOSAL_CREATED" && Date.now() - new Date(a.createdAt).getTime() < 7 * 86400000);
  const pendingProposals: LimitProposal[] = await kv.get(`limit_proposals:u:${sessionUserId}`) ?? [];
  const activePendingProposals = pendingProposals.filter(p => p.status === "PENDING");
  return c.json({ user, creditLines: creditLines ?? [], transactions: (txs ?? []).slice(0, 12), openStatement: openStmt, risk, streak, recentLimitGrowth: recentGrowth ?? null, pendingLimitProposals: activePendingProposals });
});

app.get(`${P}/users/:id/statements`, async (c) => {
  const sessionUserId = c.get("userId") as string;
  const requestedId = c.req.param("id");
  if (requestedId !== sessionUserId) return c.json({ error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
  const stmts: Statement[] = await kv.get(`statements:u:${sessionUserId}`) ?? [];
  const withItems = await Promise.all(stmts.map(async s => ({ ...s, items: await kv.get(`stmt_items:${s.id}`) ?? [] })));
  return c.json(withItems);
});

app.get(`${P}/notifications`, async (c) => {
  const userId = c.get("userId") as string;
  const notifs: Notification[] = await kv.get(`notifications:u:${userId}`) ?? [];
  return c.json(notifs);
});

app.post(`${P}/notifications/read`, async (c) => {
  const userId = c.get("userId") as string;
  const notifs: Notification[] = await kv.get(`notifications:u:${userId}`) ?? [];
  const read = notifs.map(n => ({ ...n, readAt: n.readAt ?? now() }));
  await kv.set(`notifications:u:${userId}`, read);
  return c.json({ success: true });
});

app.get(`${P}/audit-log`, async (c) => {
  const userId = c.get("userId") as string;
  const requestedUserId = c.req.query("userId") ?? userId;
  const user: User | null = await kv.get(`user:${userId}`);
  if (requestedUserId !== userId && user?.role !== "ADMIN") return c.json({ error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
  const logs: AuditLog[] = requestedUserId === "all" && user?.role === "ADMIN"
    ? await kv.get("audit:all") ?? []
    : await kv.get(`audit:u:${requestedUserId}`) ?? [];
  return c.json(logs.slice(0, 100));
});

// ── Module: Limit Proposals (RBI consent-before-increase) ────────────────────

app.get(`${P}/limit/proposals`, async (c) => {
  const userId = c.get("userId") as string;
  const proposals: LimitProposal[] = await kv.get(`limit_proposals:u:${userId}`) ?? [];
  return c.json(proposals.filter(p => p.status === "PENDING"));
});

app.post(`${P}/limit/accept-proposal`, async (c) => {
  const userId = c.get("userId") as string;
  const { proposalId } = await c.req.json();
  if (!proposalId) return c.json({ error: { code: "MISSING_FIELDS", message: "proposalId required" } }, 400);
  const proposal: LimitProposal | null = await kv.get(`limit_proposal:${proposalId}`);
  if (!proposal || proposal.userId !== userId) return c.json({ error: { code: "NOT_FOUND", message: "Proposal not found" } }, 404);
  if (proposal.status !== "PENDING") return c.json({ error: { code: "ALREADY_RESOLVED", message: "Proposal already resolved" } }, 400);
  const cl = await getCreditLine(proposal.creditLineId);
  if (!cl) return c.json({ error: { code: "NOT_FOUND", message: "Credit line not found" } }, 404);
  // Accept: mutate limit, create consent record for this specific increase
  const updated: CreditLine = { ...cl, limit: proposal.proposedLimit };
  await saveCreditLine(updated);
  const resolved: LimitProposal = { ...proposal, status: "ACCEPTED", resolvedAt: now() };
  await kv.set(`limit_proposal:${proposalId}`, resolved);
  await kv.set(`limit_proposal:pending:${cl.id}`, null);
  await updateInList(`limit_proposals:u:${userId}`, resolved);
  // Consent record for the limit increase (reuses existing consent module structure)
  const consent: ConsentRecord = { id: uid(), userId, creditLineId: cl.id, scope: "LIMIT_INCREASE", grantedAt: now(), expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(), status: "ACTIVE" };
  await kv.set(`consent:${consent.id}`, consent);
  await audit(userId, "LIMIT_INCREASED", "CreditLine", cl.id, `User accepted proposal. ₹${cl.limit} → ₹${proposal.proposedLimit}`);
  await notify(userId, "LIMIT_INCREASED", "Credit limit increased", `Your limit on ${cl.lenderName} is now ₹${proposal.proposedLimit.toLocaleString("en-IN")}.`, "grown");
  return c.json({ creditLine: updated, proposal: resolved });
});

app.post(`${P}/limit/decline-proposal`, async (c) => {
  const userId = c.get("userId") as string;
  const { proposalId } = await c.req.json();
  if (!proposalId) return c.json({ error: { code: "MISSING_FIELDS", message: "proposalId required" } }, 400);
  const proposal: LimitProposal | null = await kv.get(`limit_proposal:${proposalId}`);
  if (!proposal || proposal.userId !== userId) return c.json({ error: { code: "NOT_FOUND", message: "Proposal not found" } }, 404);
  if (proposal.status !== "PENDING") return c.json({ error: { code: "ALREADY_RESOLVED", message: "Proposal already resolved" } }, 400);
  const resolved: LimitProposal = { ...proposal, status: "DECLINED", resolvedAt: now() };
  await kv.set(`limit_proposal:${proposalId}`, resolved);
  await kv.set(`limit_proposal:pending:${proposal.creditLineId}`, null);
  await updateInList(`limit_proposals:u:${userId}`, resolved);
  await audit(userId, "LIMIT_PROPOSAL_DECLINED", "LimitProposal", proposalId, "User declined limit increase");
  return c.json({ proposal: resolved });
});

// ── Module: Key Fact Statement ────────────────────────────────────────────────

const COOLING_OFF_DAYS = 3; // RBI Digital Lending Guidelines 2022

function computeKfs(cl: CreditLine): KeyFactStatement {
  const monthlyRate = cl.interestRate; // e.g. 0.015
  const apr = Math.round(monthlyRate * 12 * 10000) / 100; // e.g. 18.00%
  // Cost example: borrow full limit, repay over 3 months
  const totalInterestIfMaxUtilized = Math.round(cl.limit * monthlyRate * 3);
  return {
    id: uid(),
    creditLineId: cl.id,
    apr,
    totalInterestIfMaxUtilized,
    allFees: [
      { name: "Processing fee", amount: 0, description: "Nil — no processing fee on this credit line" },
      { name: "Late payment fee", amount: 250, description: "₹250 flat if minimum due not paid by statement date" },
      { name: "Foreclosure charge", amount: 0, description: "Nil — prepayment allowed at any time without penalty" },
    ],
    recoveryTermsSummary: "In case of default, recovery will be initiated as per RBI Fair Practices Code. No third-party recovery agents will be used without prior notice.",
    coolingOffDays: COOLING_OFF_DAYS,
    generatedAt: now(),
  };
}

app.get(`${P}/kfs/:creditLineId`, async (c) => {
  const userId = c.get("userId") as string;
  const clId = c.req.param("creditLineId");
  const cl = await getCreditLine(clId);
  if (!cl || cl.userId !== userId) return c.json({ error: { code: "NOT_FOUND", message: "Credit line not found" } }, 404);
  return c.json(computeKfs(cl));
});

// ── Module: Cooling-Off / Right to Exit ──────────────────────────────────────

app.post(`${P}/credit-line/exit-cooling-off`, async (c) => {
  const userId = c.get("userId") as string;
  const { creditLineId } = await c.req.json();
  if (!creditLineId) return c.json({ error: { code: "MISSING_FIELDS", message: "creditLineId required" } }, 400);
  const cl = await getCreditLine(creditLineId);
  if (!cl || cl.userId !== userId) return c.json({ error: { code: "NOT_FOUND", message: "Credit line not found" } }, 404);
  if (!cl.coolingOffExpiresAt || new Date(cl.coolingOffExpiresAt) < new Date()) {
    return c.json({ error: { code: "COOLING_OFF_EXPIRED", message: "The cooling-off window has passed. You can still close the line by repaying in full." } }, 400);
  }
  // Compute amount owed: principal utilized + proportionate APR (no penalty)
  const daysUtilized = cl.firstSpentAt ? Math.max(1, Math.ceil((Date.now() - new Date(cl.firstSpentAt).getTime()) / 86400000)) : 1;
  const dailyRate = cl.interestRate / 30;
  const interestOwed = Math.round(cl.utilized * dailyRate * daysUtilized);
  const totalOwed = cl.utilized + interestOwed;
  const suspended: CreditLine = { ...cl, status: "SUSPENDED" };
  await saveCreditLine(suspended);
  // Create final settlement line item
  const finalTx: Transaction = { id: uid(), userId, creditLineId: cl.id, lenderId: cl.lenderId, merchantName: "Cooling-off exit settlement", amount: totalOwed, mode: "CREDIT_LINE", channel: "UPI", status: "SETTLED", settledAt: now(), createdAt: now() };
  await saveTransaction(finalTx);
  await audit(userId, "COOLING_OFF_EXIT", "CreditLine", cl.id, `Principal ₹${cl.utilized} + interest ₹${interestOwed} = ₹${totalOwed} settlement. No penalty.`);
  await notify(userId, "COOLING_OFF_EXIT", "Credit line closed", `Cooling-off exit processed. ₹${totalOwed.toLocaleString("en-IN")} settlement (no penalty). Line closed.`, "declined");
  return c.json({ totalOwed, principalOwed: cl.utilized, interestOwed, creditLine: suspended, note: "No penalty — proportionate APR only per RBI digital lending guidelines" });
});

// ── Module: Grievance Redressal ───────────────────────────────────────────────

app.post(`${P}/grievance/raise`, async (c) => {
  const userId = c.get("userId") as string;
  const { category, description } = await c.req.json();
  if (!category || !description) return c.json({ error: { code: "MISSING_FIELDS", message: "category and description required" } }, 400);
  const ticket: GrievanceTicket = { id: uid(), userId, category, description, status: "OPEN", createdAt: now() };
  await kv.set(`grievance:${ticket.id}`, ticket);
  const mine: GrievanceTicket[] = await kv.get(`grievances:u:${userId}`) ?? [];
  await kv.set(`grievances:u:${userId}`, [ticket, ...mine]);
  const all: GrievanceTicket[] = await kv.get("grievances:all") ?? [];
  await kv.set("grievances:all", [ticket, ...all].slice(0, 500));
  await audit(userId, "GRIEVANCE_RAISED", "GrievanceTicket", ticket.id, `Category: ${category}`);
  await notify(userId, "GRIEVANCE_RAISED", "Grievance received", `Ticket #${ticket.id.slice(0, 8).toUpperCase()} — ${category}. Nodal Officer will respond within 30 days.`, "pending");
  return c.json(ticket);
});

app.get(`${P}/grievance/mine`, async (c) => {
  const userId = c.get("userId") as string;
  const tickets: GrievanceTicket[] = await kv.get(`grievances:u:${userId}`) ?? [];
  return c.json(tickets);
});

app.get(`${P}/grievance/all`, async (c) => {
  const userId = c.get("userId") as string;
  const user: User | null = await kv.get(`user:${userId}`);
  if (user?.role !== "ADMIN") return c.json({ error: { code: "FORBIDDEN", message: "Admin only" } }, 403);
  const tickets: GrievanceTicket[] = await kv.get("grievances:all") ?? [];
  return c.json(tickets);
});

app.post(`${P}/grievance/:id/resolve`, async (c) => {
  const userId = c.get("userId") as string;
  const user: User | null = await kv.get(`user:${userId}`);
  if (user?.role !== "ADMIN") return c.json({ error: { code: "FORBIDDEN", message: "Admin only" } }, 403);
  const ticketId = c.req.param("id");
  const { resolution } = await c.req.json();
  const ticket: GrievanceTicket | null = await kv.get(`grievance:${ticketId}`);
  if (!ticket) return c.json({ error: { code: "NOT_FOUND", message: "Ticket not found" } }, 404);
  const resolved: GrievanceTicket = { ...ticket, status: "RESOLVED", resolution, resolvedAt: now() };
  await kv.set(`grievance:${ticketId}`, resolved);
  await updateInList(`grievances:u:${ticket.userId}`, resolved);
  await updateInList("grievances:all", resolved);
  await audit(userId, "GRIEVANCE_RESOLVED", "GrievanceTicket", ticketId, resolution ?? "Resolved by admin");
  await notify(ticket.userId, "GRIEVANCE_RESOLVED", "Grievance resolved", `Ticket #${ticketId.slice(0, 8).toUpperCase()} has been resolved: ${resolution ?? "See admin notes"}`, "settled");
  return c.json(resolved);
});

// ── Module: Spending Insights ─────────────────────────────────────────────────

const MERCHANT_CATEGORIES: { pattern: RegExp; category: string }[] = [
  { pattern: /zomato|swiggy|instamart/i, category: "Food & Delivery" },
  { pattern: /amazon|flipkart|myntra/i, category: "Shopping" },
  { pattern: /irctc|ola|uber|rapido/i, category: "Travel & Transport" },
  { pattern: /bookmyshow|netflix|spotify/i, category: "Entertainment" },
  { pattern: /repay/i, category: "Repayments" },
  { pattern: /phonepe|paytm|gpay/i, category: "Transfers" },
];

function categorise(merchant: string): string {
  for (const { pattern, category } of MERCHANT_CATEGORIES) {
    if (pattern.test(merchant)) return category;
  }
  return "Other";
}

app.get(`${P}/insights/:userId`, async (c) => {
  const sessionUserId = c.get("userId") as string;
  const requestedId = c.req.param("userId");
  if (requestedId !== sessionUserId) return c.json({ error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
  const txs: Transaction[] = await kv.get(`transactions:u:${sessionUserId}`) ?? [];
  const creditTxs = txs.filter(t => t.mode === "CREDIT_LINE" && t.status !== "CANCELLED");
  const totalSpend = creditTxs.reduce((s, t) => s + t.amount, 0);
  const byCategory: Record<string, number> = {};
  for (const tx of creditTxs) {
    const cat = categorise(tx.merchantName);
    byCategory[cat] = (byCategory[cat] ?? 0) + tx.amount;
  }
  const breakdown = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount, pct: totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
  return c.json({ totalSpend, breakdown, transactionCount: creditTxs.length });
});

// ── Module: Autopay / Repayment Mandate ──────────────────────────────────────

app.post(`${P}/mandate/setup`, async (c) => {
  const userId = c.get("userId") as string;
  const { creditLineId, type } = await c.req.json();
  if (!creditLineId || !type || !["FULL", "MINIMUM"].includes(type)) return c.json({ error: { code: "MISSING_FIELDS", message: "creditLineId and type (FULL|MINIMUM) required" } }, 400);
  const cl = await getCreditLine(creditLineId);
  if (!cl || cl.userId !== userId) return c.json({ error: { code: "NOT_FOUND", message: "Credit line not found" } }, 404);
  const mandate: RepaymentMandate = { id: uid(), userId, creditLineId, type, active: true, createdAt: now() };
  await kv.set(`mandate:${userId}:${creditLineId}`, mandate);
  const all: RepaymentMandate[] = await kv.get(`mandates:u:${userId}`) ?? [];
  const updated = [...all.filter(m => m.creditLineId !== creditLineId), mandate];
  await kv.set(`mandates:u:${userId}`, updated);
  await audit(userId, "MANDATE_SET", "RepaymentMandate", mandate.id, `${type} autopay on ${cl.lenderName}`);
  await notify(userId, "MANDATE_SET", "Autopay set up", `${type === "FULL" ? "Full" : "Minimum"} due will be auto-repaid each statement cycle on ${cl.lenderName}.`, "settled");
  return c.json(mandate);
});

app.post(`${P}/mandate/cancel`, async (c) => {
  const userId = c.get("userId") as string;
  const { creditLineId } = await c.req.json();
  if (!creditLineId) return c.json({ error: { code: "MISSING_FIELDS", message: "creditLineId required" } }, 400);
  const mandate: RepaymentMandate | null = await kv.get(`mandate:${userId}:${creditLineId}`);
  if (!mandate) return c.json({ error: { code: "NOT_FOUND", message: "No mandate found" } }, 404);
  const cancelled = { ...mandate, active: false };
  await kv.set(`mandate:${userId}:${creditLineId}`, cancelled);
  await updateInList(`mandates:u:${userId}`, cancelled);
  await audit(userId, "MANDATE_CANCELLED", "RepaymentMandate", mandate.id, "Autopay cancelled by user");
  return c.json(cancelled);
});

app.get(`${P}/mandate/mine`, async (c) => {
  const userId = c.get("userId") as string;
  const mandates: RepaymentMandate[] = await kv.get(`mandates:u:${userId}`) ?? [];
  return c.json(mandates.filter(m => m.active));
});

// ── Module: Statement PDF (HTML passbook format, browser prints to PDF) ───────

app.get(`${P}/billing/statement/:id/pdf`, async (c) => {
  const userId = c.get("userId") as string;
  const stmtId = c.req.param("id");
  const stmt: Statement | null = await kv.get(`statement:${stmtId}`);
  if (!stmt || stmt.userId !== userId) return c.json({ error: { code: "NOT_FOUND", message: "Statement not found" } }, 404);
  const items: StatementLineItem[] = await kv.get(`stmt_items:${stmtId}`) ?? [];
  const user: User | null = await kv.get(`user:${userId}`);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statement ${stmtId.slice(0, 8)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Public+Sans:wght@400;500&display=swap');
  body{margin:0;padding:32px;background:#F7F3EA;color:#1C1A17;font-family:'Public Sans',sans-serif;font-size:13px}
  h1{font-family:'Fraunces',Georgia,serif;font-size:22px;margin:0 0 4px;font-weight:400}
  .sub{color:#8B7355;font-size:11px;margin-bottom:24px}
  .rule{border:none;border-top:1px solid #C9C0AC;margin:16px 0}
  table{width:100%;border-collapse:collapse}
  th{font-size:10px;color:#8B7355;text-transform:uppercase;letter-spacing:.07em;text-align:left;padding:6px 0;border-bottom:1px solid #C9C0AC}
  td{padding:10px 0;border-bottom:1px solid #C9C0AC;vertical-align:top}
  .date{font-family:'Fraunces',Georgia,serif;font-size:10px;color:#8B7355;width:70px}
  .amt{font-family:'Fraunces',Georgia,serif;font-variant-numeric:tabular-nums;text-align:right;color:#A8532E}
  .totals{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}
  .tot-label{font-size:10px;color:#8B7355;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
  .tot-val{font-family:'Fraunces',Georgia,serif;font-size:22px;font-variant-numeric:tabular-nums}
  .footer{margin-top:32px;font-size:10px;color:#8B7355;line-height:1.6}
  @media print{body{background:white}}
</style></head><body>
  <h1>ConsumptionCredit</h1>
  <div class="sub">Statement · ${user?.name ?? userId} · ${user?.upiVpa ?? ""}</div>
  <hr class="rule">
  <div class="totals">
    <div><div class="tot-label">Total due</div><div class="tot-val" style="color:#A8532E">₹${stmt.totalDue.toLocaleString("en-IN")}</div><div style="font-size:10px;color:#8B7355;margin-top:3px">Due ${new Date(stmt.dueDate).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</div></div>
    <div><div class="tot-label">Minimum due</div><div class="tot-val">₹${stmt.minimumDue.toLocaleString("en-IN")}</div><div style="font-size:10px;color:#8B7355;margin-top:3px">${stmt.status}</div></div>
  </div>
  <hr class="rule">
  <table><thead><tr><th class="date">Date</th><th>Description</th><th>Lender</th><th style="text-align:right">Amount</th></tr></thead><tbody>
  ${items.map(i => `<tr><td class="date">${new Date(i.date).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</td><td>${i.description}</td><td style="color:#8B7355;font-size:11px">${i.lenderName}</td><td class="amt">₹${i.amount.toLocaleString("en-IN")}</td></tr>`).join("")}
  </tbody></table>
  <div class="footer">Period: ${new Date(stmt.periodStart).toLocaleDateString("en-IN")} – ${new Date(stmt.periodEnd).toLocaleDateString("en-IN")}<br>This is a computer-generated statement. ConsumptionCredit — DEMO. Not a regulated financial instrument.</div>
  <script>window.onload=()=>window.print()</script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
});

// ── Demo controls ─────────────────────────────────────────────────────────────

// Demo bypass: create a session for any seeded user without OTP
// Clearly labeled — not available in production
app.post(`${P}/demo/login-as`, async (c) => {
  const { userId } = await c.req.json();
  const user: User | null = await kv.get(`user:${userId}`);
  if (!user) return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  const token = generateToken();
  const tokenHash = await sha256(token);
  const session: Session = { id: uid(), userId: user.id, tokenHash, createdAt: now(), expiresAt: new Date(Date.now() + 24 * 3600000).toISOString() };
  await kv.set(`session:${tokenHash}`, session);
  return c.json({ token, user, note: "DEMO ONLY — bypasses OTP authentication" });
});

app.post(`${P}/demo/advance-day`, async (c) => {
  const userId = c.get("userId") as string;
  const txs: Transaction[] = await kv.get(`transactions:u:${userId}`) ?? [];
  let settled = 0;

  // Auto-settle pending transactions
  for (const tx of txs.filter(t => t.status === "PENDING_CONFIRMATION")) {
    const cl = await getCreditLine(tx.creditLineId);
    if (!cl) continue;
    const settledTx: Transaction = { ...tx, status: "EXPIRED_AUTO_SETTLED", settledAt: now() };
    await saveCreditLine({ ...cl, utilized: cl.utilized + tx.amount, heldAmount: Math.max(0, cl.heldAmount - tx.amount) });
    await saveTransaction(settledTx);
    await appendLineItem(settledTx, cl);
    await audit(userId, "TRANSACTION_AUTO_SETTLED", "Transaction", tx.id, "Demo: advance time");
    settled++;
  }

  // Advance cooling-off windows by 1 day so they can be tested as expired
  const cls: CreditLine[] = await kv.get(`credit_lines:u:${userId}`) ?? [];
  for (const cl of cls) {
    if (cl.coolingOffExpiresAt) {
      const newExpiry = new Date(new Date(cl.coolingOffExpiresAt).getTime() - 86400000).toISOString();
      await saveCreditLine({ ...cl, coolingOffExpiresAt: newExpiry });
    }
  }

  // Trigger active autopay mandates when a billing period has ended
  const mandates: RepaymentMandate[] = await kv.get(`mandates:u:${userId}`) ?? [];
  const activeMandates = mandates.filter(m => m.active);
  let autopayTriggered = 0;
  for (const mandate of activeMandates) {
    const stmt: Statement | null = await kv.get(`stmt:open:${userId}`);
    if (!stmt || stmt.totalDue <= 0) continue;
    const repayAmount = mandate.type === "FULL" ? stmt.totalDue : stmt.minimumDue;
    if (repayAmount <= 0) continue;
    // Reuse billing/repay logic inline
    const items: StatementLineItem[] = await kv.get(`stmt_items:${stmt.id}`) ?? [];
    const lenderTotals: Record<string, { lenderName: string; total: number }> = {};
    for (const item of items) {
      if (!lenderTotals[item.lenderId]) lenderTotals[item.lenderId] = { lenderName: item.lenderName, total: 0 };
      lenderTotals[item.lenderId].total += item.amount;
    }
    const grandTotal = Object.values(lenderTotals).reduce((s, v) => s + v.total, 0);
    let remaining = repayAmount;
    const entries = Object.entries(lenderTotals);
    const creditLines: CreditLine[] = await kv.get(`credit_lines:u:${userId}`) ?? [];
    for (let i = 0; i < entries.length; i++) {
      const [lid, info] = entries[i];
      const share = i === entries.length - 1 ? remaining : Math.round((info.total / grandTotal) * repayAmount);
      remaining -= share;
      const cl2 = creditLines.find(c => c.lenderId === lid);
      if (cl2) await saveCreditLine({ ...cl2, utilized: Math.max(0, cl2.utilized - share) });
    }
    const newTotal = Math.max(0, stmt.totalDue - repayAmount);
    const updatedStmt: Statement = { ...stmt, totalDue: newTotal, minimumDue: Math.ceil(newTotal * 0.05), status: newTotal <= 0 ? "PAID" : "OPEN" };
    await kv.set(`statement:${stmt.id}`, updatedStmt);
    await kv.set(`stmt:open:${userId}`, updatedStmt);
    await updateInList(`statements:u:${userId}`, updatedStmt);
    await audit(userId, "AUTOPAY_TRIGGERED", "Statement", stmt.id, `${mandate.type} autopay via mandate. ₹${repayAmount} repaid.`);
    await notify(userId, "TX_SETTLED", "Autopay executed", `₹${repayAmount.toLocaleString("en-IN")} auto-repaid (${mandate.type === "FULL" ? "full" : "minimum"} mandate).`, "settled");
    autopayTriggered++;
  }

  return c.json({ message: `Settled ${settled} pending transaction(s), triggered ${autopayTriggered} autopay mandate(s), advanced cooling-off windows by 1 day` });
});

app.post(`${P}/demo/simulate-late`, async (c) => {
  const userId = c.get("userId") as string;
  const streak: RepaymentStreak = await kv.get(`streak:${userId}`) ?? { userId, consecutiveOnTime: 0, consecutiveFullPayment: 0, updatedAt: now() };
  const updated = { ...streak, consecutiveOnTime: 0, consecutiveFullPayment: 0, lastLateAt: now(), updatedAt: now() };
  await kv.set(`streak:${userId}`, updated);
  await audit(userId, "LATE_PAYMENT_SIMULATED", "User", userId, "Demo: simulated late repayment, streak reset");
  return c.json({ streak: updated });
});

// ── Seed ──────────────────────────────────────────────────────────────────────

app.post(`${P}/seed`, async (c) => {
  const force = (await c.req.json().catch(() => ({}))).force ?? false;
  const existing: User[] = await kv.get("users") ?? [];
  if (existing.length > 0 && !force) return c.json({ message: "Already seeded", users: existing.map(u => u.id) });

  const lenders: Lender[] = [{ id: "lender_axis", name: "Axis Bank", type: "BANK", maxTxAmount: 20000, priority: 1 }, { id: "lender_dmi", name: "DMI Finance", type: "NBFC", maxTxAmount: 15000, priority: 2 }];
  for (const l of lenders) await kv.set(`lender:${l.id}`, l);

  // Demo phone numbers — labelled clearly
  const DEMO_PHONES: Record<string, string> = { u_priya: "+919900000001", u_arjun: "+919900000002", u_rahul: "+919900000003", u_sneha: "+919900000004", u_vikram: "+919900000005" };

  async function seedUser(u: User, lines: { lenderId: string; limit: number; utilized: number }[], txData: { daysAgo: number; merchant: string; amount: number; status: TxStatus }[]) {
    await kv.set(`user:${u.id}`, u);
    await kv.set(`user:phone:${u.phone}`, u.id);
    const all: User[] = await kv.get("users") ?? [];
    if (!all.find(x => x.id === u.id)) await kv.set("users", [...all, u]);

    const cls: CreditLine[] = lines.map(l => ({ id: `cl_${u.id}_${l.lenderId}`, userId: u.id, lenderId: l.lenderId, lenderName: lenders.find(x => x.id === l.lenderId)!.name, limit: l.limit, utilized: l.utilized, heldAmount: 0, status: "ACTIVE" as ClStatus, interestRate: 0.015, coolingOffExpiresAt: new Date(Date.now() + COOLING_OFF_DAYS * 86400000).toISOString() }));
    for (const cl of cls) {
      await saveCreditLine(cl);
      const consent: ConsentRecord = { id: uid(), userId: u.id, creditLineId: cl.id, scope: "SPEND,REPAY,STATEMENT_VIEW", grantedAt: new Date(Date.now() - 90 * 86400000).toISOString(), expiresAt: new Date(Date.now() + 275 * 86400000).toISOString(), status: "ACTIVE" };
      await kv.set(`consent:${consent.id}`, consent);
      await kv.set(`consent:active:${u.id}:${cl.id}`, consent);
    }

    const txList: Transaction[] = [];
    for (const t of txData) {
      const cl = cls[0];
      const createdAt = new Date(Date.now() - t.daysAgo * 86400000).toISOString();
      const tx: Transaction = { id: uid(), userId: u.id, creditLineId: cl.id, lenderId: cl.lenderId, merchantName: t.merchant, amount: t.amount, mode: "CREDIT_LINE", channel: "UPI", status: t.status, createdAt, settledAt: t.status === "SETTLED" ? createdAt : undefined };
      txList.push(tx);
      await kv.set(`transaction:${tx.id}`, tx);
      if (t.status === "SETTLED") await appendLineItem(tx, cl);
    }
    await kv.set(`transactions:u:${u.id}`, txList.reverse());
    await kv.set(`streak:${u.id}`, { userId: u.id, consecutiveOnTime: 4, consecutiveFullPayment: 4, updatedAt: now() });
    const { tier, limit, signals, composite } = computeRisk(txList);
    await kv.set(`risk_latest:${u.id}`, { id: uid(), userId: u.id, recommendedLimit: limit, tier, signals, compositeScore: composite, createdAt: now() });
  }

  await seedUser({ id: "u_priya", phone: DEMO_PHONES.u_priya, phoneVerifiedAt: now(), name: "Priya Mehta", panNumberMasked: maskPan("ABCDE1234F"), kycStatus: "SIMULATED_VERIFIED", upiVpa: "priya@axisb", createdAt: new Date(Date.now() - 180 * 86400000).toISOString(), role: "ADMIN" }, [{ lenderId: "lender_axis", limit: 30000, utilized: 8520 }, { lenderId: "lender_dmi", limit: 15000, utilized: 3370 }], [{ daysAgo: 75, merchant: "BookMyShow", amount: 840, status: "SETTLED" }, { daysAgo: 60, merchant: "IRCTC", amount: 1840, status: "SETTLED" }, { daysAgo: 52, merchant: "Amazon", amount: 2200, status: "SETTLED" }, { daysAgo: 45, merchant: "Repayment", amount: 5200, status: "SETTLED" }, { daysAgo: 38, merchant: "Zomato", amount: 450, status: "SETTLED" }, { daysAgo: 30, merchant: "Myntra", amount: 2200, status: "SETTLED" }, { daysAgo: 22, merchant: "Repayment", amount: 3000, status: "SETTLED" }, { daysAgo: 14, merchant: "Swiggy Instamart", amount: 720, status: "SETTLED" }, { daysAgo: 8, merchant: "Amazon", amount: 3200, status: "SETTLED" }, { daysAgo: 3, merchant: "PhonePe", amount: 2000, status: "SETTLED" }, { daysAgo: 1, merchant: "Zomato", amount: 450, status: "SETTLED" }]);
  await seedUser({ id: "u_arjun", phone: DEMO_PHONES.u_arjun, phoneVerifiedAt: now(), name: "Arjun Sharma", kycStatus: "SIMULATED_VERIFIED", upiVpa: "arjun@ybl", createdAt: new Date(Date.now() - 200 * 86400000).toISOString(), role: "USER" }, [{ lenderId: "lender_dmi", limit: 5000, utilized: 0 }], [{ daysAgo: 120, merchant: "Amazon", amount: 500, status: "SETTLED" }]);
  await seedUser({ id: "u_rahul", phone: DEMO_PHONES.u_rahul, phoneVerifiedAt: now(), name: "Rahul Verma", kycStatus: "SIMULATED_VERIFIED", upiVpa: "rahul@oksbi", createdAt: new Date(Date.now() - 365 * 86400000).toISOString(), role: "USER" }, [{ lenderId: "lender_axis", limit: 50000, utilized: 12000 }, { lenderId: "lender_dmi", limit: 20000, utilized: 4000 }], [{ daysAgo: 85, merchant: "Flipkart", amount: 8500, status: "SETTLED" }, { daysAgo: 70, merchant: "IRCTC", amount: 3200, status: "SETTLED" }, { daysAgo: 55, merchant: "Myntra", amount: 5600, status: "SETTLED" }, { daysAgo: 40, merchant: "Zomato", amount: 650, status: "SETTLED" }, { daysAgo: 32, merchant: "Apple Store", amount: 15000, status: "SETTLED" }, { daysAgo: 24, merchant: "Repayment", amount: 20000, status: "SETTLED" }, { daysAgo: 8, merchant: "Amazon", amount: 7500, status: "SETTLED" }, { daysAgo: 2, merchant: "Swiggy", amount: 420, status: "SETTLED" }]);
  await seedUser({ id: "u_sneha", phone: DEMO_PHONES.u_sneha, phoneVerifiedAt: now(), name: "Sneha Patel", kycStatus: "SIMULATED_VERIFIED", upiVpa: "sneha@paytm", createdAt: new Date(Date.now() - 15 * 86400000).toISOString(), role: "USER" }, [{ lenderId: "lender_dmi", limit: 5000, utilized: 0 }], []);
  await seedUser({ id: "u_vikram", phone: DEMO_PHONES.u_vikram, phoneVerifiedAt: now(), name: "Vikram Das", panNumberMasked: maskPan("XYZPQ9876A"), kycStatus: "SIMULATED_VERIFIED", upiVpa: "vikram@ibl", createdAt: new Date(Date.now() - 120 * 86400000).toISOString(), role: "USER" }, [{ lenderId: "lender_axis", limit: 12000, utilized: 9500 }, { lenderId: "lender_dmi", limit: 8000, utilized: 6000 }], [{ daysAgo: 90, merchant: "Zomato", amount: 900, status: "SETTLED" }, { daysAgo: 60, merchant: "Amazon", amount: 6500, status: "SETTLED" }, { daysAgo: 30, merchant: "Repayment (partial)", amount: 3000, status: "SETTLED" }, { daysAgo: 10, merchant: "Swiggy", amount: 450, status: "SETTLED" }]);
  await kv.set("streak:u_vikram", { userId: "u_vikram", consecutiveOnTime: 1, consecutiveFullPayment: 0, lastLateAt: new Date(Date.now() - 30 * 86400000).toISOString(), updatedAt: now() });

  return c.json({ message: "Seeded 5 demo users", demoPhones: DEMO_PHONES, users: ["u_priya", "u_arjun", "u_rahul", "u_sneha", "u_vikram"] });
});

app.get(`${P}/health`, c => c.json({ status: "ok" }));
Deno.serve(app.fetch);
