import { createHmac, timingSafeEqual } from "crypto";

export class GitHubWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubWebhookVerificationError";
  }
}

export class GitHubWebhookVerifier {
  private readonly secret: string;

  constructor(secret: string) {
    if (!secret) {
      throw new Error("GitHub webhook secret must not be empty");
    }
    this.secret = secret;
  }

  verify(payload: string | Buffer, signatureHeader: string | null): void {
    if (!signatureHeader) {
      throw new GitHubWebhookVerificationError(
        "Missing X-Hub-Signature-256 header"
      );
    }

    if (!signatureHeader.startsWith("sha256=")) {
      throw new GitHubWebhookVerificationError(
        "Signature header must start with 'sha256='"
      );
    }

    const signature = signatureHeader.slice("sha256=".length);

    const body =
      typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;

    const expectedSignature = createHmac("sha256", this.secret)
      .update(body)
      .digest("hex");

    const signatureBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (signatureBuffer.length !== expectedBuffer.length) {
      throw new GitHubWebhookVerificationError("Invalid signature length");
    }

    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);
    if (!isValid) {
      throw new GitHubWebhookVerificationError(
        "Webhook signature verification failed"
      );
    }
  }
}
