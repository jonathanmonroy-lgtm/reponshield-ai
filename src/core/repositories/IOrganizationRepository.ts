import type {
  Organization,
  CreateOrganizationInput,
} from "@/core/entities/Organization";
import type { Result } from "@/lib/types";

export interface IOrganizationRepository {
  findById(id: string): Promise<Result<Organization | null>>;
  findBySlug(slug: string): Promise<Result<Organization | null>>;
  findByUserId(userId: string): Promise<Result<Organization[]>>;
  create(
    input: CreateOrganizationInput,
    userId: string
  ): Promise<Result<Organization>>;
  update(
    id: string,
    data: Partial<
      Pick<
        Organization,
        | "name"
        | "githubInstallationId"
        | "preferredAiProvider"
        | "preferredAiModel"
      >
    >
  ): Promise<Result<Organization>>;
  delete(id: string): Promise<Result<void>>;
}
