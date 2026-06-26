import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  computeStateHmac,
  hmacEqual,
} from "@/app/api/github/callback/route";

const SECRET = "test-webhook-secret-32-bytes-long!";

describe("computeStateHmac", () => {
  it("produces a hex string", () => {
    const hmac = computeStateHmac("org-uuid|nonce-123", SECRET);
    expect(hmac).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    const a = computeStateHmac("org-uuid|nonce-abc", SECRET);
    const b = computeStateHmac("org-uuid|nonce-abc", SECRET);
    expect(a).toBe(b);
  });

  it("produces different outputs for different inputs", () => {
    const a = computeStateHmac("org-1|nonce-x", SECRET);
    const b = computeStateHmac("org-2|nonce-x", SECRET);
    expect(a).not.toBe(b);
  });

  it("matches an independently computed HMAC-SHA256", () => {
    const cookieValue = "uuid-org|random-nonce";
    const expected = createHmac("sha256", SECRET)
      .update(cookieValue)
      .digest("hex");
    expect(computeStateHmac(cookieValue, SECRET)).toBe(expected);
  });
});

describe("hmacEqual", () => {
  it("returns true for identical hex strings", () => {
    const h = computeStateHmac("a|b", SECRET);
    expect(hmacEqual(h, h)).toBe(true);
  });

  it("returns false for different hex strings of the same length", () => {
    const h1 = computeStateHmac("a|b", SECRET);
    const h2 = computeStateHmac("a|c", SECRET);
    expect(hmacEqual(h1, h2)).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    const h = computeStateHmac("a|b", SECRET);
    expect(hmacEqual(h, h.slice(0, 32))).toBe(false);
  });

  it("returns false for empty strings", () => {
    expect(hmacEqual("", "")).toBe(false);
  });

  it("returns false for non-hex garbage input", () => {
    const h = computeStateHmac("a|b", SECRET);
    expect(hmacEqual(h, "not-hex!!!")).toBe(false);
  });
});

describe("CSRF state round-trip", () => {
  it("validates a correctly signed state param", () => {
    const cookieValue = "org-uuid-abc|nonce-xyz-789";
    const stateParam = computeStateHmac(cookieValue, SECRET);
    const expectedHmac = computeStateHmac(cookieValue, SECRET);
    expect(hmacEqual(expectedHmac, stateParam)).toBe(true);
  });

  it("rejects a state param signed with a different secret", () => {
    const cookieValue = "org-uuid-abc|nonce-xyz-789";
    const stateParam = computeStateHmac(cookieValue, "wrong-secret");
    const expectedHmac = computeStateHmac(cookieValue, SECRET);
    expect(hmacEqual(expectedHmac, stateParam)).toBe(false);
  });

  it("rejects a tampered orgId in the cookie", () => {
    const originalCookie = "org-legitimate|nonce-abc";
    const stateParam = computeStateHmac(originalCookie, SECRET);

    const tamperedCookie = "org-attacker|nonce-abc";
    const expectedHmac = computeStateHmac(tamperedCookie, SECRET);
    expect(hmacEqual(expectedHmac, stateParam)).toBe(false);
  });

  it("rejects a tampered nonce in the cookie", () => {
    const originalCookie = "org-uuid|original-nonce";
    const stateParam = computeStateHmac(originalCookie, SECRET);

    const tamperedCookie = "org-uuid|different-nonce";
    const expectedHmac = computeStateHmac(tamperedCookie, SECRET);
    expect(hmacEqual(expectedHmac, stateParam)).toBe(false);
  });
});
