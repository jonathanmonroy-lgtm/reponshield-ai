import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ok, err } from "@/lib/types";

// ── Hoisted mock fns (available at vi.mock factory time) ──────────────────────

const { mockConstructEvent, mockUpsert, mockUpdateStatus } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockUpsert: vi.fn(),
  mockUpdateStatus: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
  })),
}));

vi.mock("@/lib/container", () => ({
  buildContainer: vi.fn().mockReturnValue({
    repos: {
      subscriptionRepo: {
        findByOrganizationId: vi.fn(),
        findByStripeSubscriptionId: vi.fn(),
        upsert: mockUpsert,
        updateStatus: mockUpdateStatus,
      },
    },
    useCases: {},
    encryption: null,
  }),
}));

// ── Import route AFTER mocks ───────────────────────────────────────────────────

import { POST } from "@/app/api/billing/stripe/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(
  body: string,
  sig: string | null = "sig_test"
): NextRequest {
  const headers: Record<string, string> = { "content-type": "text/plain" };
  if (sig !== null) headers["stripe-signature"] = sig;
  return new NextRequest("http://localhost/api/billing/stripe", {
    method: "POST",
    headers,
    body,
  });
}

function makeSubscriptionEvent(
  type: string,
  metadata: Record<string, string> = { organization_id: "org-123" }
): unknown {
  return {
    id: "evt_test",
    type,
    data: {
      object: {
        id: "sub_test",
        customer: "cus_test",
        status: "active",
        cancel_at_period_end: false,
        current_period_start: 1700000000,
        current_period_end: 1702592000,
        metadata,
        items: {
          data: [{ price: { lookup_key: "starter_monthly" } }],
        },
      },
    },
  };
}

function makeInvoiceEvent(
  type: string,
  subscriptionId: string | null
): unknown {
  return {
    id: "evt_test",
    type,
    data: {
      object: {
        id: "in_test",
        parent: subscriptionId
          ? {
              type: "subscription_details",
              subscription_details: { subscription: subscriptionId },
            }
          : null,
      },
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/billing/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_mock");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_mock");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service");
    vi.stubEnv("ENCRYPTION_SECRET", "a".repeat(64));
    mockUpsert.mockResolvedValue(ok({ id: "row-1" }));
    mockUpdateStatus.mockResolvedValue(ok(undefined));
  });

  it("returns 500 when STRIPE_SECRET_KEY is missing", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const req = makeRequest("{}");
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("not configured");
  });

  it("returns 400 when stripe-signature header is absent", async () => {
    const req = makeRequest("{}", null);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("stripe-signature");
  });

  it("returns 400 when webhook signature is invalid", async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error("No signatures found");
    });
    const req = makeRequest("{}", "bad_sig");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid webhook signature");
  });

  it("upserts subscription on customer.subscription.updated", async () => {
    const event = makeSubscriptionEvent("customer.subscription.updated");
    mockConstructEvent.mockReturnValueOnce(event);

    const res = await POST(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-123",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_test",
        status: "active",
        planType: "starter",
      })
    );
    const body = (await res.json()) as { received: boolean };
    expect(body.received).toBe(true);
  });

  it("upserts subscription on customer.subscription.created", async () => {
    const event = makeSubscriptionEvent("customer.subscription.created");
    mockConstructEvent.mockReturnValueOnce(event);

    const res = await POST(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" })
    );
  });

  it("upserts as canceled on customer.subscription.deleted", async () => {
    const event = makeSubscriptionEvent("customer.subscription.deleted");
    mockConstructEvent.mockReturnValueOnce(event);

    const res = await POST(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "canceled" })
    );
  });

  it("skips subscription events with no organization_id in metadata", async () => {
    const event = makeSubscriptionEvent("customer.subscription.updated", {});
    mockConstructEvent.mockReturnValueOnce(event);

    const res = await POST(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { skipped: string };
    expect(body.skipped).toContain("no_organization_id_in_metadata");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("updates status to past_due on invoice.payment_failed", async () => {
    const event = makeInvoiceEvent("invoice.payment_failed", "sub_test");
    mockConstructEvent.mockReturnValueOnce(event);

    const res = await POST(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith("sub_test", "past_due");
  });

  it("updates status to active on invoice.payment_succeeded", async () => {
    const event = makeInvoiceEvent("invoice.payment_succeeded", "sub_test");
    mockConstructEvent.mockReturnValueOnce(event);

    const res = await POST(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith("sub_test", "active");
  });

  it("skips invoice events with no subscription ID", async () => {
    const event = makeInvoiceEvent("invoice.payment_failed", null);
    mockConstructEvent.mockReturnValueOnce(event);

    const res = await POST(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("returns skipped for unknown event types", async () => {
    const event = {
      id: "evt_x",
      type: "payment_intent.created",
      data: { object: {} },
    };
    mockConstructEvent.mockReturnValueOnce(event);

    const res = await POST(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { skipped: string };
    expect(body.skipped).toContain("unhandled_event");
  });

  it("returns 500 when upsert fails", async () => {
    const event = makeSubscriptionEvent("customer.subscription.updated");
    mockConstructEvent.mockReturnValueOnce(event);
    mockUpsert.mockResolvedValueOnce(err(new Error("DB write failed")));

    const res = await POST(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("DB write failed");
  });
});
