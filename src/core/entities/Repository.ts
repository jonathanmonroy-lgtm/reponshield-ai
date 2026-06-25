export interface Repository {
  id: string;
  organizationId: string;
  githubRepoId: number;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  webhookId: number | null;
  webhookActive: boolean;
  auditEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRepositoryInput {
  organizationId: string;
  githubRepoId: number;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
}

export class RepositoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryValidationError";
  }
}

export function validateRepository(
  input: CreateRepositoryInput
): RepositoryValidationError | null {
  if (!input.fullName.includes("/")) {
    return new RepositoryValidationError(
      "fullName must be in owner/repo format"
    );
  }
  if (input.githubRepoId <= 0) {
    return new RepositoryValidationError("githubRepoId must be a positive integer");
  }
  return null;
}
