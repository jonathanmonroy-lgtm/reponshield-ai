import type { SupabaseServiceClient } from "@/infrastructure/database/supabase/client";
import type { ISubscriptionRepository } from "@/core/repositories/ISubscriptionRepository";
import type {
  Subscription,
  UpsertSubscriptionInput,
  SubscriptionStatus,
  PlanType,
} from "@/core/entities/Subscription";
import { ok, err } from "@/lib/types";
import type { Result } from "@/lib/types";
import type { Database } from "@/infrastructure/database/supabase/database.types";

type Row = Database["public"]["Tables"]["subscriptions"]["Row"];

function toEntity(row: Row): Subscription {
  return {
    id: row.id,
    organizationId: row.organization_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    status: row.status as SubscriptionStatus,
    planType: row.plan_type as PlanType,
    currentPeriodStart: new Date(row.current_period_start),
    currentPeriodEnd: new Date(row.current_period_end),
    cancelAtPeriodEnd: row.cancel_at_period_end,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class SupabaseSubscriptionRepository
  implements ISubscriptionRepository
{
  constructor(private readonly db: SupabaseServiceClient) {}

  async findByOrganizationId(
    orgId: string
  ): Promise<Result<Subscription | null>> {
    const { data, error } = await this.db
      .from("subscriptions")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return err(new Error(error.message));
    return ok(data ? toEntity(data) : null);
  }

  async findByStripeSubscriptionId(
    stripeSubId: string
  ): Promise<Result<Subscription | null>> {
    const { data, error } = await this.db
      .from("subscriptions")
      .select("*")
      .eq("stripe_subscription_id", stripeSubId)
      .maybeSingle();
    if (error) return err(new Error(error.message));
    return ok(data ? toEntity(data) : null);
  }

  async upsert(input: UpsertSubscriptionInput): Promise<Result<Subscription>> {
    const now = new Date().toISOString();
    const { data, error } = await this.db
      .from("subscriptions")
      .upsert(
        {
          organization_id: input.organizationId,
          stripe_customer_id: input.stripeCustomerId,
          stripe_subscription_id: input.stripeSubscriptionId,
          status: input.status,
          plan_type: input.planType,
          current_period_start: input.currentPeriodStart.toISOString(),
          current_period_end: input.currentPeriodEnd.toISOString(),
          cancel_at_period_end: input.cancelAtPeriodEnd,
          updated_at: now,
        },
        { onConflict: "organization_id" }
      )
      .select()
      .single();
    if (error) return err(new Error(error.message));
    return ok(toEntity(data));
  }

  async updateStatus(
    stripeSubscriptionId: string,
    status: SubscriptionStatus
  ): Promise<Result<void>> {
    const { error } = await this.db
      .from("subscriptions")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", stripeSubscriptionId);
    if (error) return err(new Error(error.message));
    return ok(undefined);
  }
}
