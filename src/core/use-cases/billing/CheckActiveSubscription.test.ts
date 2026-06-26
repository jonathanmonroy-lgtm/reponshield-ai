import { describe, it, expect, vi } from "vitest";
import { CheckActiveSubscriptionUseCase } from "@/core/use-cases/billing/CheckActiveSubscription";
import type { ISubscriptionRepository } from "@/core/repositories/ISubscriptionRepository";
import type { Subscription } from "@/core/entities/Subscription";
import { ok, err } from "@/lib/types";

function makeRepo(sub: Subscription | null): ISubscriptionRepository {
  return {
    findByOrganizationId: vi.fn().mockResolvedValue(ok(sub)),
    findByStripeSubscriptionId: vi.fn().mockResolvedValue(ok(null)),
    upsert: vi.fn().mockResolvedValue(ok(sub)),
    updateStatus: vi.fn().mockResolvedValue(ok(undefined)),
  };
}

function makeSub(status: Subscription["status"]): Subscription {
  const now = new Date();
  return {
    id: "sub-1",
    organizationId: "org-1",
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    status,
    planType: "starter",
    currentPeriodStart: now,
    currentPeriodEnd: now,
    cancelAtPeriodEnd: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe("CheckActiveSubscriptionUseCase", () => {
  it("returns true for an active subscription", async () => {
    const uc = new CheckActiveSubscriptionUseCase(makeRepo(makeSub("active")));
    const result = await uc.execute("org-1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(true);
  });

  it("returns true for a trialing subscription", async () => {
    const uc = new CheckActiveSubscriptionUseCase(
      makeRepo(makeSub("trialing"))
    );
    const result = await uc.execute("org-1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(true);
  });

  it("returns false for a canceled subscription", async () => {
    const uc = new CheckActiveSubscriptionUseCase(
      makeRepo(makeSub("canceled"))
    );
    const result = await uc.execute("org-1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(false);
  });

  it("returns false for a past_due subscription", async () => {
    const uc = new CheckActiveSubscriptionUseCase(
      makeRepo(makeSub("past_due"))
    );
    const result = await uc.execute("org-1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(false);
  });

  it("returns false for an incomplete subscription", async () => {
    const uc = new CheckActiveSubscriptionUseCase(
      makeRepo(makeSub("incomplete"))
    );
    const result = await uc.execute("org-1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(false);
  });

  it("returns false when no subscription record exists", async () => {
    const uc = new CheckActiveSubscriptionUseCase(makeRepo(null));
    const result = await uc.execute("org-1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(false);
  });

  it("calls findByOrganizationId with the correct org ID", async () => {
    const repo = makeRepo(makeSub("active"));
    const uc = new CheckActiveSubscriptionUseCase(repo);
    await uc.execute("org-abc");
    expect(repo.findByOrganizationId).toHaveBeenCalledWith("org-abc");
  });

  it("propagates repository errors as a failed Result", async () => {
    const repo: ISubscriptionRepository = {
      findByOrganizationId: vi
        .fn()
        .mockResolvedValue(err(new Error("DB connection failed"))),
      findByStripeSubscriptionId: vi.fn(),
      upsert: vi.fn(),
      updateStatus: vi.fn(),
    };
    const uc = new CheckActiveSubscriptionUseCase(repo);
    const result = await uc.execute("org-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("DB connection failed");
    }
  });
});
