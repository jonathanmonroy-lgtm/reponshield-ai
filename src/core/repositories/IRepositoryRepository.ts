import type {
  Repository,
  CreateRepositoryInput,
} from "@/core/entities/Repository";
import type { Result } from "@/lib/types";

export interface IRepositoryRepository {
  findById(id: string): Promise<Result<Repository | null>>;
  findByOrganizationId(orgId: string): Promise<Result<Repository[]>>;
  findByGithubRepoId(githubRepoId: number): Promise<Result<Repository | null>>;
  create(input: CreateRepositoryInput): Promise<Result<Repository>>;
  update(
    id: string,
    data: Partial<
      Pick<
        Repository,
        | "webhookId"
        | "webhookActive"
        | "auditEnabled"
        | "defaultBranch"
      >
    >
  ): Promise<Result<Repository>>;
  delete(id: string): Promise<Result<void>>;
}
