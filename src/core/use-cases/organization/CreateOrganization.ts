import type { IOrganizationRepository } from "@/core/repositories/IOrganizationRepository";
import {
  validateOrganization,
  type Organization,
  type CreateOrganizationInput,
} from "@/core/entities/Organization";
import { err } from "@/lib/types";
import type { Result } from "@/lib/types";
import { slugify } from "@/lib/utils";

export class CreateOrganizationUseCase {
  constructor(private readonly orgRepo: IOrganizationRepository) {}

  async execute(
    name: string,
    userId: string,
    slugOverride?: string
  ): Promise<Result<Organization>> {
    const slug = slugOverride ?? slugify(name);
    const input: CreateOrganizationInput = {
      name: name.trim(),
      slug,
      preferredAiProvider: "openai",
      preferredAiModel: "gpt-4o-mini",
    };

    const validationError = validateOrganization(input);
    if (validationError) return err(validationError);

    const existing = await this.orgRepo.findBySlug(slug);
    if (!existing.success) return existing;
    if (existing.data) {
      return err(
        new Error(`Organization with slug "${slug}" already exists`)
      );
    }

    return this.orgRepo.create(input, userId);
  }
}
