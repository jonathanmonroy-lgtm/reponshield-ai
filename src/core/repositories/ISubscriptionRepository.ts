import type {
  Subscription,
  SubscriptionStatus,
  UpsertSubscriptionInput,
} from "@/core/entities/Subscription";
import type { Result } from "@/lib/types";

export interface ISubscriptionRepository {
  findByOrganizationId(orgId: string): Promise<Result<Subscription | null>>;
  findByStripeSubscriptionId(
    stripeSubId: string
  ): Promise<Result<Subscription | null>>;
  upsert(input: UpsertSubscriptionInput): Promise<Result<Subscription>>;
  updateStatus(
    stripeSubscriptionId: string,
    status: SubscriptionStatus
  ): Promise<Result<void>>;
}
