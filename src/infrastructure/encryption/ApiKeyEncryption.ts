import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

// Explicit scrypt parameters — must never change without a key-rotation migration.
// N=16384 (2^14): CPU/memory cost; r=8: block size; p=1: parallelization; keyLen=32: AES-256.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLen: 32 } as const;

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  }) as Buffer;
}

export class ApiKeyEncryption {
  private readonly secret: string;

  constructor(secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error(
        "ENCRYPTION_SECRET must be at least 16 characters"
      );
    }
    this.secret = secret;
  }

  async encrypt(plaintext: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = deriveKey(this.secret, salt);

    const cipher = createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([salt, iv, authTag, encrypted]);
    return combined.toString("base64url");
  }

  async decrypt(ciphertext: string): Promise<string> {
    const combined = Buffer.from(ciphertext, "base64url");

    if (combined.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error("Invalid ciphertext: too short");
    }

    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const encrypted = combined.subarray(
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );

    const key = deriveKey(this.secret, salt);

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  }
}
