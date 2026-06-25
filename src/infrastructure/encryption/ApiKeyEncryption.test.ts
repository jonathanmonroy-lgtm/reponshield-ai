import { describe, it, expect, beforeEach } from "vitest";
import { ApiKeyEncryption } from "./ApiKeyEncryption";

const SECRET = "test-encryption-secret-that-is-long-enough";

describe("ApiKeyEncryption", () => {
  let encryption: ApiKeyEncryption;

  beforeEach(() => {
    encryption = new ApiKeyEncryption(SECRET);
  });

  it("encrypts and decrypts a plaintext API key", async () => {
    const plaintext = "sk-abc123XYZsecretKey456";
    const ciphertext = await encryption.encrypt(plaintext);
    const decrypted = await encryption.decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext each time (random IV)", async () => {
    const plaintext = "sk-samekey";
    const c1 = await encryption.encrypt(plaintext);
    const c2 = await encryption.encrypt(plaintext);
    expect(c1).not.toBe(c2);
  });

  it("throws on tampered ciphertext (auth tag failure)", async () => {
    const plaintext = "sk-ant-api03-secret";
    const ciphertext = await encryption.encrypt(plaintext);

    const corrupted = ciphertext.slice(0, -4) + "XXXX";
    await expect(encryption.decrypt(corrupted)).rejects.toThrow();
  });

  it("throws on ciphertext that is too short", async () => {
    await expect(
      encryption.decrypt(Buffer.from("short").toString("base64url"))
    ).rejects.toThrow("Invalid ciphertext: too short");
  });

  it("throws when secret is too short", () => {
    expect(() => new ApiKeyEncryption("short")).toThrow();
  });

  it("encrypts a long API key (Anthropic format)", async () => {
    const longKey =
      "sk-ant-api03-" + "x".repeat(80);
    const ciphertext = await encryption.encrypt(longKey);
    const decrypted = await encryption.decrypt(ciphertext);
    expect(decrypted).toBe(longKey);
  });

  it("handles unicode characters in plaintext", async () => {
    const unicode = "sk-🔐-special-key-üñíçödé";
    const ciphertext = await encryption.encrypt(unicode);
    const decrypted = await encryption.decrypt(ciphertext);
    expect(decrypted).toBe(unicode);
  });
});
