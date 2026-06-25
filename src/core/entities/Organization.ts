import type { AIProvider } from "@/lib/types";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  githubInstallationId: string | null;
  preferredAiProvider: AIProvider;
  preferredAiModel: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  preferredAiProvider?: AIProvider;
  preferredAiModel?: string;
}

export class OrganizationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationValidationError";
  }
}

export function validateOrganization(
  input: CreateOrganizationInput
): OrganizationValidationError | null {
  if (!input.name.trim() || input.name.length < 2) {
    return new OrganizationValidationError(
      "Organization name must be at least 2 characters"
    );
  }
  if (!/^[a-z0-9-]+$/.test(input.slug)) {
    return new OrganizationValidationError(
      "Slug must contain only lowercase letters, numbers, and hyphens"
    );
  }
  return null;
}
