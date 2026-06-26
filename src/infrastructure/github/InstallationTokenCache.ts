const EXPIRY_BUFFER_MS = 60_000;

interface CacheEntry {
  token: string;
  expiresAt: Date;
}

export class InstallationTokenCache {
  private readonly cache = new Map<string, CacheEntry>();

  get(installationId: string): string | null {
    const entry = this.cache.get(installationId);
    if (!entry || entry.expiresAt <= new Date(Date.now() + EXPIRY_BUFFER_MS)) {
      return null;
    }
    return entry.token;
  }

  set(installationId: string, token: string, expiresAt: Date): void {
    this.cache.set(installationId, { token, expiresAt });
  }

  invalidate(installationId: string): void {
    this.cache.delete(installationId);
  }

  has(installationId: string): boolean {
    return this.get(installationId) !== null;
  }
}

// Module-level singleton: persists across requests within a single serverless
// function instance, giving cross-request token reuse without a Redis dependency.
export const installationTokenCache = new InstallationTokenCache();
