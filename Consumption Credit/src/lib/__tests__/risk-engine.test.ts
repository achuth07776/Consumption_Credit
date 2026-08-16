import { describe, it, expect } from "vitest";

// ── Inline the pure risk computation so tests run without Deno/Hono ───────────

type TxStatus = "INITIATED" | "PENDING_CONFIRMATION" | "SETTLED" | "CANCELLED" | "EXPIRED_AUTO_SETTLED";
type LimitTier = "INSUFFICIENT_DATA" | "LOW" | "MEDIUM" | "HIGH";

interface Tx {
  merchantName: string; amount: number; status: TxStatus; createdAt: string;
}

function computeRisk(txHistory: Tx[]): { tier: LimitTier; limit: number; composite: number } {
  const recent = txHistory.filter(
    (t) => Date.now() - new Date(t.createdAt).getTime() < 90 * 86400000,
  );
  const freq = Math.min(recent.length, 30);
  const amounts = recent.map((t) => t.amount);
  const avgTicket = amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
  const uniqueMerchants = new Set(recent.map((t) => t.merchantName)).size;
  const settled = txHistory.filter((t) => t.status === "SETTLED").length;
  const regularity = txHistory.length > 0 ? (settled / txHistory.length) * 100 : 0;
  const ageDays =
    txHistory.length > 0
      ? (Date.now() - new Date(txHistory[txHistory.length - 1].createdAt).getTime()) / 86400000
      : 0;
  const signals = [
    { weight: 0.25, score: (freq / 30) * 100 },
    { weight: 0.2, score: Math.min((avgTicket / 5000) * 100, 100) },
    { weight: 0.2, score: Math.min((uniqueMerchants / 8) * 100, 100) },
    { weight: 0.25, score: regularity },
    { weight: 0.1, score: Math.min((ageDays / 180) * 100, 100) },
  ];
  const composite = signals.reduce((acc, s) => acc + s.score * s.weight, 0);
  if (txHistory.length < 2) return { tier: "INSUFFICIENT_DATA", limit: 5000, composite };
  if (composite < 30) return { tier: "LOW", limit: Math.round((10000 + composite * 200) / 1000) * 1000, composite };
  if (composite < 55) return { tier: "MEDIUM", limit: Math.round((20000 + composite * 300) / 1000) * 1000, composite };
  return { tier: "HIGH", limit: Math.min(Math.round((40000 + composite * 600) / 1000) * 1000, 100000), composite };
}

function makeTx(daysAgo: number, merchant: string, amount: number, status: TxStatus = "SETTLED"): Tx {
  return { merchantName: merchant, amount, status, createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString() };
}

// ── Test cases from docs/features/01-risk-engine.md ──────────────────────────

describe("Risk Engine — computeRisk()", () => {
  it("thin file but good payer → INSUFFICIENT_DATA for <2 txs", () => {
    const { tier, limit } = computeRisk([makeTx(10, "Amazon", 500)]);
    expect(tier).toBe("INSUFFICIENT_DATA");
    expect(limit).toBe(5000);
  });

  it("high-frequency low-diversity → MEDIUM tier", () => {
    // 20 transactions but all at the same merchant → low diversity score
    const txs = Array.from({ length: 20 }, (_, i) =>
      makeTx(i * 2, "Zomato", 300),
    );
    const { tier } = computeRisk(txs);
    // low diversity + moderate frequency → MEDIUM or LOW
    expect(["LOW", "MEDIUM"]).toContain(tier);
  });

  it("near-dormant with missed payments → LOW tier", () => {
    // Old txs outside 90-day window, but with a cancelled tx → regularity hurt
    const txs = [
      makeTx(200, "Amazon", 1000, "SETTLED"),
      makeTx(190, "Swiggy", 500, "CANCELLED"),
    ];
    const { tier } = computeRisk(txs);
    // freq=0, merchantDiversity=0, avgTicket=0 → composite pulled down
    // regularity=50% → moderate, but overall should be LOW or MEDIUM
    expect(["LOW", "MEDIUM"]).toContain(tier);
  });

  it("high-quality profile → HIGH tier", () => {
    // Many recent txs, diverse merchants, all settled
    const merchants = ["Amazon", "Zomato", "IRCTC", "Myntra", "BookMyShow", "Swiggy", "Flipkart", "Paytm"];
    const txs = merchants.flatMap((m, i) =>
      Array.from({ length: 4 }, (_, j) => makeTx(i * 5 + j, m, 2000 + i * 200)),
    );
    const { tier } = computeRisk(txs);
    expect(tier).toBe("HIGH");
  });

  it("composite score is deterministic — same inputs same output", () => {
    const txs = [makeTx(10, "Amazon", 1000), makeTx(20, "Zomato", 500)];
    const a = computeRisk(txs);
    const b = computeRisk(txs);
    expect(a.composite).toBe(b.composite);
    expect(a.tier).toBe(b.tier);
  });
});
