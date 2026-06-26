import { describe, it, expect } from "vitest";
import { ApiKeyEncryption } from "./ApiKeyEncryption";

const VALID_SECRET = "a-valid-encryption-secret-32chars";
const OTHER_SECRET = "a-completely-different-secret-xyz";

describe("ApiKeyEncryption — edge cases & stress", () => {
  it("throws on decrypt when the wrong ENCRYPTION_SECRET is used", async () => {
    const enc = new ApiKeyEncryption(VALID_SECRET);
    const decBad = new ApiKeyEncryption(OTHER_SECRET);
    const ciphertext = await enc.encrypt("sk-openai-secret-value");
    await expect(decBad.decrypt(ciphertext)).rejects.toThrow();
  });

  it("round-trips an empty string (zero-length plaintext)", async () => {
    const enc = new ApiKeyEncryption(VALID_SECRET);
    const ciphertext = await enc.encrypt("");
    const decrypted = await enc.decrypt(ciphertext);
    expect(decrypted).toBe("");
  });

  it("round-trips a plaintext that is itself a base64url string", async () => {
    const enc = new ApiKeyEncryption(VALID_SECRET);
    const base64Key = Buffer.from("sk-raw-openai-key").toString("base64url");
    const ciphertext = await enc.encrypt(base64Key);
    expect(await enc.decrypt(ciphertext)).toBe(base64Key);
  });

  it("rejects a ciphertext whose decoded length is exactly 43 bytes (one under minimum)", async () => {
    const enc = new ApiKeyEncryption(VALID_SECRET);
    // 43 bytes encoded in base64url — guaranteed to fail the < 44-byte guard
    const tooShort = Buffer.from(new Uint8Array(43)).toString("base64url");
    await expect(enc.decrypt(tooShort)).rejects.toThrow("Invalid ciphertext: too short");
  });

  it("round-trips a 256-character API key without data loss", async () => {
    const enc = new ApiKeyEncryption(VALID_SECRET);
    // 3 + (36 × 8) = 291 chars — comfortably over 256
    const longKey = "sk-" + "abcdefghijklmnopqrstuvwxyz0123456789".repeat(8);
    expect(longKey.length).toBeGreaterThanOrEqual(256);
    expect(await enc.decrypt(await enc.encrypt(longKey))).toBe(longKey);
  });

  it("each encryption of the same plaintext produces a unique ciphertext (fresh IV per call)", async () => {
    const enc = new ApiKeyEncryption(VALID_SECRET);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => enc.encrypt("sk-same-key"))
    );
    // All 5 ciphertexts must be distinct
    const unique = new Set(results);
    expect(unique.size).toBe(5);
  });

  it("rejects tampered ciphertext even when only one byte is changed at the start", async () => {
    const enc = new ApiKeyEncryption(VALID_SECRET);
    const ciphertext = await enc.encrypt("sk-sensitive-value");
    // Corrupt the very first character of the base64url blob (affects salt)
    const tampered =
      (ciphertext[0] === "A" ? "B" : "A") + ciphertext.slice(1);
    await expect(enc.decrypt(tampered)).rejects.toThrow();
  });
});
