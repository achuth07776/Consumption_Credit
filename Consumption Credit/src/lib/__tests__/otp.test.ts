import { describe, it, expect } from "vitest";

// ── OTP challenge logic (pure functions) ──────────────────────────────────────

interface OtpChallenge { codeHash: string; expiresAt: string; attempts: number; verifiedAt?: string }

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const MAX_ATTEMPTS = 5;

async function verifyOtp(
  challenge: OtpChallenge,
  input: string,
): Promise<{ success: boolean; reason?: string; updatedChallenge: OtpChallenge }> {
  if (challenge.verifiedAt) return { success: false, reason: "ALREADY_USED", updatedChallenge: challenge };
  if (new Date(challenge.expiresAt) < new Date()) return { success: false, reason: "OTP_EXPIRED", updatedChallenge: challenge };
  if (challenge.attempts >= MAX_ATTEMPTS) return { success: false, reason: "MAX_ATTEMPTS", updatedChallenge: challenge };

  const inputHash = await sha256(input);
  if (inputHash !== challenge.codeHash) {
    const updated = { ...challenge, attempts: challenge.attempts + 1 };
    const exhausted = updated.attempts >= MAX_ATTEMPTS;
    return { success: false, reason: exhausted ? "MAX_ATTEMPTS" : "INVALID_OTP", updatedChallenge: updated };
  }

  return { success: true, updatedChallenge: { ...challenge, verifiedAt: new Date().toISOString() } };
}

async function makeChallenge(otp: string): Promise<OtpChallenge> {
  return {
    codeHash: await sha256(otp),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    attempts: 0,
  };
}

describe("OTP verification", () => {
  it("correct OTP → success", async () => {
    const challenge = await makeChallenge("123456");
    const { success } = await verifyOtp(challenge, "123456");
    expect(success).toBe(true);
  });

  it("wrong OTP → failure, attempts incremented", async () => {
    const challenge = await makeChallenge("123456");
    const { success, updatedChallenge } = await verifyOtp(challenge, "000000");
    expect(success).toBe(false);
    expect(updatedChallenge.attempts).toBe(1);
  });

  it("exceeding 5 attempts invalidates the challenge", async () => {
    let challenge = await makeChallenge("123456");
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const r = await verifyOtp(challenge, "000000");
      challenge = r.updatedChallenge;
    }
    expect(challenge.attempts).toBe(MAX_ATTEMPTS);
    // Another attempt — should be blocked by attempt limit
    const { success, reason } = await verifyOtp(challenge, "123456");
    expect(success).toBe(false);
    expect(reason).toBe("MAX_ATTEMPTS");
  });

  it("already-used OTP is rejected", async () => {
    const challenge = await makeChallenge("123456");
    const { updatedChallenge } = await verifyOtp(challenge, "123456");
    const { success, reason } = await verifyOtp(updatedChallenge, "123456");
    expect(success).toBe(false);
    expect(reason).toBe("ALREADY_USED");
  });

  it("expired OTP is rejected", async () => {
    const challenge: OtpChallenge = {
      codeHash: await sha256("123456"),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      attempts: 0,
    };
    const { success, reason } = await verifyOtp(challenge, "123456");
    expect(success).toBe(false);
    expect(reason).toBe("OTP_EXPIRED");
  });

  it("OTP code is never stored plaintext — only hash is checked", async () => {
    const otp = "987654";
    const challenge = await makeChallenge(otp);
    // The challenge only stores the hash, not the plaintext
    expect(challenge.codeHash).not.toBe(otp);
    expect(challenge.codeHash).toHaveLength(64); // SHA-256 hex
  });
});
