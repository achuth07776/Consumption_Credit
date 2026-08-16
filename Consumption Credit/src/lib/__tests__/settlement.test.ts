import { describe, it, expect } from "vitest";

// ── Settlement state machine ──────────────────────────────────────────────────

type TxStatus = "INITIATED" | "PENDING_CONFIRMATION" | "SETTLED" | "CANCELLED" | "EXPIRED_AUTO_SETTLED";

interface Tx { id: string; amount: number; status: TxStatus }

// Valid transitions — modelled as an adjacency map
const VALID_TRANSITIONS: Record<TxStatus, TxStatus[]> = {
  INITIATED:             ["PENDING_CONFIRMATION", "SETTLED", "CANCELLED"],
  PENDING_CONFIRMATION:  ["SETTLED", "CANCELLED", "EXPIRED_AUTO_SETTLED"],
  SETTLED:               [],
  CANCELLED:             [],
  EXPIRED_AUTO_SETTLED:  [],
};

function transition(tx: Tx, next: TxStatus): Tx {
  const allowed = VALID_TRANSITIONS[tx.status];
  if (!allowed.includes(next)) {
    throw new Error(`Invalid transition: ${tx.status} → ${next}`);
  }
  return { ...tx, status: next };
}

const pending: Tx = { id: "tx1", amount: 15000, status: "PENDING_CONFIRMATION" };

describe("Settlement state machine", () => {
  it("PENDING_CONFIRMATION → SETTLED is valid", () => {
    const settled = transition(pending, "SETTLED");
    expect(settled.status).toBe("SETTLED");
  });

  it("PENDING_CONFIRMATION → CANCELLED is valid", () => {
    const cancelled = transition(pending, "CANCELLED");
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("PENDING_CONFIRMATION → EXPIRED_AUTO_SETTLED is valid", () => {
    const expired = transition(pending, "EXPIRED_AUTO_SETTLED");
    expect(expired.status).toBe("EXPIRED_AUTO_SETTLED");
  });

  it("SETTLED → CANCELLED is invalid — structurally rejected", () => {
    const settled: Tx = { ...pending, status: "SETTLED" };
    expect(() => transition(settled, "CANCELLED")).toThrow();
  });

  it("SETTLED → SETTLED is invalid (double-settle)", () => {
    const settled: Tx = { ...pending, status: "SETTLED" };
    expect(() => transition(settled, "SETTLED")).toThrow();
  });

  it("CANCELLED → SETTLED is invalid", () => {
    const cancelled: Tx = { ...pending, status: "CANCELLED" };
    expect(() => transition(cancelled, "SETTLED")).toThrow();
  });

  it("amount ≤ ₹10,000 → directly SETTLED (not PENDING_CONFIRMATION)", () => {
    const amount = 5000;
    const expectedStatus: TxStatus = amount > 10000 ? "PENDING_CONFIRMATION" : "SETTLED";
    expect(expectedStatus).toBe("SETTLED");
  });

  it("amount > ₹10,000 → PENDING_CONFIRMATION first", () => {
    const amount = 15000;
    const expectedStatus: TxStatus = amount > 10000 ? "PENDING_CONFIRMATION" : "SETTLED";
    expect(expectedStatus).toBe("PENDING_CONFIRMATION");
  });
});
