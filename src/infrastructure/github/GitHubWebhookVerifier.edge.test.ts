import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "crypto";
import {
  GitHubWebhookVerifier,
  GitHubWebhookVerificationError,
} from "./GitHubWebhookVerifier";

const SECRET = "production-grade-webhook-secret-value";

function makeSignature(payload: string | Buffer, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

describe("GitHubWebhookVerifier — edge cases & adversarial inputs", () => {
  let verifier: GitHubWebhookVerifier;

  beforeEach(() => {
    verifier = new GitHubWebhookVerifier(SECRET);
  });

  it("rejects a signature header that is an empty string (not null)", () => {
    expect(() => verifier.verify("payload", "")).toThrowError(
      GitHubWebhookVerificationError
    );
  });

  it("rejects a signature containing non-hex unicode characters after sha256=", () => {
    const weirdSig = "sha256=café" + "a".repeat(60);
    expect(() => verifier.verify("normal payload", weirdSig)).toThrowError(
      GitHubWebhookVerificationError
    );
  });

  it("rejects a valid-looking signature computed with a completely different secret", () => {
    const payload = '{"action":"opened","number":1}';
    const wrongSig = makeSignature(payload, "totally-wrong-secret-xxxxx");
    expect(() => verifier.verify(payload, wrongSig)).toThrowError(
      GitHubWebhookVerificationError
    );
  });

  it("rejects a signature with a leading space before the sha256= prefix", () => {
    const payload = '{"action":"synchronize"}';
    const validSig = makeSignature(payload);
    expect(() =>
      verifier.verify(payload, " " + validSig)
    ).toThrowError(GitHubWebhookVerificationError);
  });

  it("rejects the sha256= prefix with an empty hex body", () => {
    // sha256= followed by nothing — Buffer.from("","hex").length is 0,
    // which differs in length from the expected 32-byte digest.
    expect(() =>
      verifier.verify("any payload", "sha256=")
    ).toThrowError(GitHubWebhookVerificationError);
  });

  it("correctly verifies a payload that contains unicode characters (emoji, accents)", () => {
    const unicodePayload = JSON.stringify({
      title: "Fix: handle José's café ☕ input",
      body: "Special characters: üñíçödé — em dash",
    });
    const sig = makeSignature(unicodePayload);
    expect(() => verifier.verify(unicodePayload, sig)).not.toThrow();
  });

  it("correctly verifies a very large payload (100 KB of JSON)", () => {
    const largePayload = JSON.stringify({ data: "x".repeat(100_000) });
    const sig = makeSignature(largePayload);
    expect(() => verifier.verify(largePayload, sig)).not.toThrow();
  });

  it("rejects a signature that is the correct length but has bit-flipped hex digits", () => {
    const payload = '{"action":"reopened","number":7}';
    const validSig = makeSignature(payload);
    // Flip one hex digit in the middle of the signature
    const pos = "sha256=".length + 20;
    const flipped =
      validSig.slice(0, pos) +
      (validSig[pos] === "a" ? "b" : "a") +
      validSig.slice(pos + 1);
    expect(() => verifier.verify(payload, flipped)).toThrowError(
      GitHubWebhookVerificationError
    );
  });

  it("verifies a Buffer payload the same as its string equivalent", () => {
    const str = '{"action":"opened","number":5}';
    const buf = Buffer.from(str, "utf8");
    const sigFromString = makeSignature(str);
    const sigFromBuffer = makeSignature(buf);
    // Signatures must match — HMAC of the raw bytes is identical either way
    expect(sigFromString).toBe(sigFromBuffer);
    expect(() => verifier.verify(buf, sigFromBuffer)).not.toThrow();
  });
});
