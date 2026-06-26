import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { buildContainer } from "@/lib/container";
import type { SubscriptionStatus, PlanType } from "@/core/entities/Subscription";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
}

function resolvePlanType(sub: Stripe.Subscription): PlanType {
  const meta = sub.metadata["plan_type"];
  if (meta === "pro" || meta === "enterprise" || meta === "starter") return meta;
  const lookupKey = sub.items.data[0]?.price?.lookup_key ?? "";
  if (lookupKey.includes("enterprise")) return "enterprise";
  if (lookupKey.includes("pro")) return "pro";
  return "starter";
}

function resolveCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer
): string {
  return typeof customer === "string" ? customer : customer.id;
}

function resolveSubscriptionId(
  parent: Stripe.Invoice["parent"]
): string | null {
  if (!parent || parent.type !== "subscription_details") return null;
  const sub = parent.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 500 }
    );
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  const { repos } = buildContainer();

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata["organization_id"];
      if (!orgId) {
        return NextResponse.json({
          received: true,
          skipped: "no_organization_id_in_metadata",
        });
      }

      const upsertResult = await repos.subscriptionRepo.upsert({
        organizationId: orgId,
        stripeCustomerId: resolveCustomerId(sub.customer),
        stripeSubscriptionId: sub.id,
        status: sub.status as SubscriptionStatus,
        planType: resolvePlanType(sub),
        currentPeriodStart: new Date(
          (sub as unknown as { current_period_start: number })
            .current_period_start * 1000
        ),
        currentPeriodEnd: new Date(
          (sub as unknown as { current_period_end: number })
            .current_period_end * 1000
        ),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });

      if (!upsertResult.success) {
        return NextResponse.json(
          { error: upsertResult.error.message },
          { status: 500 }
        );
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata["organization_id"];
      if (!orgId) {
        return NextResponse.json({
          received: true,
          skipped: "no_organization_id_in_metadata",
        });
      }

      const deleteResult = await repos.subscriptionRepo.upsert({
        organizationId: orgId,
        stripeCustomerId: resolveCustomerId(sub.customer),
        stripeSubscriptionId: sub.id,
        status: "canceled",
        planType: resolvePlanType(sub),
        currentPeriodStart: new Date(
          (sub as unknown as { current_period_start: number })
            .current_period_start * 1000
        ),
        currentPeriodEnd: new Date(
          (sub as unknown as { current_period_end: number })
            .current_period_end * 1000
        ),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });

      if (!deleteResult.success) {
        return NextResponse.json(
          { error: deleteResult.error.message },
          { status: 500 }
        );
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = resolveSubscriptionId(invoice.parent);
      if (subId) {
        const updateResult = await repos.subscriptionRepo.updateStatus(
          subId,
          "past_due"
        );
        if (!updateResult.success) {
          return NextResponse.json(
            { error: updateResult.error.message },
            { status: 500 }
          );
        }
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = resolveSubscriptionId(invoice.parent);
      if (subId) {
        const updateResult = await repos.subscriptionRepo.updateStatus(
          subId,
          "active"
        );
        if (!updateResult.success) {
          return NextResponse.json(
            { error: updateResult.error.message },
            { status: 500 }
          );
        }
      }
      break;
    }

    default:
      return NextResponse.json({
        received: true,
        skipped: `unhandled_event:${event.type}`,
      });
  }

  return NextResponse.json({ received: true });
}
