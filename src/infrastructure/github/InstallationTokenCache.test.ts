import { describe, it, expect, beforeEach } from "vitest";
import { InstallationTokenCache } from "@/infrastructure/github/InstallationTokenCache";

describe("InstallationTokenCache", () => {
  let cache: InstallationTokenCache;

  beforeEach(() => {
    cache = new InstallationTokenCache();
  });

  describe("get()", () => {
    it("returns null on cache miss", () => {
      expect(cache.get("123")).toBeNull();
    });

    it("returns the token when not near expiry", () => {
      const expiresAt = new Date(Date.now() + 3_600_000); // 1 hour
      cache.set("123", "ghs_token_abc", expiresAt);
      expect(cache.get("123")).toBe("ghs_token_abc");
    });

    it("returns null when token expires within the 60-second buffer", () => {
      const expiresAt = new Date(Date.now() + 30_000); // 30s — inside buffer
      cache.set("123", "ghs_soon", expiresAt);
      expect(cache.get("123")).toBeNull();
    });

    it("returns null for an already-expired token", () => {
      const expiresAt = new Date(Date.now() - 1_000);
      cache.set("123", "ghs_expired", expiresAt);
      expect(cache.get("123")).toBeNull();
    });

    it("returns the token when it expires just beyond the buffer", () => {
      const expiresAt = new Date(Date.now() + 61_000); // 61s — outside buffer
      cache.set("123", "ghs_edge", expiresAt);
      expect(cache.get("123")).toBe("ghs_edge");
    });
  });

  describe("set() and invalidate()", () => {
    it("invalidates a specific installation without affecting others", () => {
      const expiresAt = new Date(Date.now() + 3_600_000);
      cache.set("install-1", "token_a", expiresAt);
      cache.set("install-2", "token_b", expiresAt);

      cache.invalidate("install-1");

      expect(cache.get("install-1")).toBeNull();
      expect(cache.get("install-2")).toBe("token_b");
    });

    it("invalidating a non-existent entry is a no-op", () => {
      expect(() => cache.invalidate("nonexistent")).not.toThrow();
    });

    it("overwrites an existing entry on re-set", () => {
      const soon = new Date(Date.now() + 3_600_000);
      cache.set("123", "old_token", soon);
      cache.set("123", "new_token", soon);
      expect(cache.get("123")).toBe("new_token");
    });
  });

  describe("has()", () => {
    it("returns false on cache miss", () => {
      expect(cache.has("456")).toBe(false);
    });

    it("returns true for a valid cached token", () => {
      cache.set("456", "tok", new Date(Date.now() + 3_600_000));
      expect(cache.has("456")).toBe(true);
    });

    it("returns false after invalidation", () => {
      cache.set("456", "tok", new Date(Date.now() + 3_600_000));
      cache.invalidate("456");
      expect(cache.has("456")).toBe(false);
    });

    it("returns false for a near-expired token (buffer enforced)", () => {
      cache.set("456", "tok", new Date(Date.now() + 30_000));
      expect(cache.has("456")).toBe(false);
    });
  });
});
