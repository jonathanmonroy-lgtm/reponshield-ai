import type { ISubscriptionRepository } from "@/core/repositories/ISubscriptionRepository";
import { isSubscriptionActive } from "@/core/entities/Subscription";
import { ok } from "@/lib/types";
import type { Result } from "@/lib/types";

export class CheckActiveSubscriptionUseCase {
  constructor(
    private readonly subscriptionRepo: ISubscriptionRepository
  ) {}

  async execute(organizationId: string): Promise<Result<boolean>> {
    const result =
      await this.subscriptionRepo.findByOrganizationId(organizationId);
    if (!result.success) return result;
    if (!result.data) return ok(false);
    return ok(isSubscriptionActive(result.data));
  }
}
