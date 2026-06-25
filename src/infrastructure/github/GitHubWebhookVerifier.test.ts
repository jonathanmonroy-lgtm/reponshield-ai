import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "crypto";
import {
  GitHubWebhookVerifier,
  GitHubWebhookVerificationError,
} from "./GitHubWebhookVerifier";

const SECRET = "test-webhook-secret-32-chars-long";

function makeSignature(payload: string, secret = SECRET): string {
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `sha256=${sig}`;
}

describe("GitHubWebhookVerifier", () => {
  let verifier: GitHubWebhookVerifier;

  beforeEach(() => {
    verifier = new GitHubWebhookVerifier(SECRET);
  });

  it("verifies a valid signature without throwing", () => {
    const payload = JSON.stringify({ action: "opened", number: 1 });
    const signature = makeSignature(payload);
    expect(() => verifier.verify(payload, signature)).not.toThrow();
  });

  it("throws when signature header is null", () => {
    expect(() => verifier.verify("payload", null)).toThrowError(
      GitHubWebhookVerificationError
    );
  });

  it("throws when signature does not start with sha256=", () => {
    expect(() =>
      verifier.verify("payload", "sha1=abc123")
    ).toThrowError(GitHubWebhookVerificationError);
  });

  it("throws when signature is incorrect", () => {
    const payload = "some-payload";
    const badSig = "sha256=" + "a".repeat(64);
    expect(() => verifier.verify(payload, badSig)).toThrowError(
      GitHubWebhookVerificationError
    );
  });

  it("throws when payload is tampered but signature is from original", () => {
    const originalPayload = '{"action":"opened"}';
    const tamperedPayload = '{"action":"closed"}';
    const sig = makeSignature(originalPayload);
    expect(() =>
      verifier.verify(tamperedPayload, sig)
    ).toThrowError(GitHubWebhookVerificationError);
  });

  it("verifies Buffer payloads correctly", () => {
    const payload = Buffer.from("binary-payload", "utf8");
    const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
    expect(() =>
      verifier.verify(payload, `sha256=${sig}`)
    ).not.toThrow();
  });

  it("throws if secret is empty string in constructor", () => {
    expect(() => new GitHubWebhookVerifier("")).toThrow();
  });

  it("is resistant to different-length signatures (timing-safe)", () => {
    const payload = "payload";
    const shortSig = "sha256=abc";
    expect(() => verifier.verify(payload, shortSig)).toThrowError(
      GitHubWebhookVerificationError
    );
  });
});
