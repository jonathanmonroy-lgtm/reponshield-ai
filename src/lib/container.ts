import { ApiKeyEncryption } from "@/infrastructure/encryption/ApiKeyEncryption";
import { createServiceClient } from "@/infrastructure/database/supabase/client";
import { SupabaseOrganizationRepository } from "@/infrastructure/database/supabase/OrganizationRepository";
import { SupabaseRepositoryRepository } from "@/infrastructure/database/supabase/RepositoryRepository";
import { SupabaseApiKeyRepository } from "@/infrastructure/database/supabase/ApiKeyRepository";
import { SupabaseAuditRepository } from "@/infrastructure/database/supabase/AuditRepository";
import { SupabaseMigrationRepository } from "@/infrastructure/database/supabase/MigrationRepository";
import { SupabaseSubscriptionRepository } from "@/infrastructure/database/supabase/SubscriptionRepository";
import { StoreApiKeyUseCase } from "@/core/use-cases/api-keys/StoreApiKey";
import { GetDecryptedApiKeyUseCase } from "@/core/use-cases/api-keys/GetApiKey";
import { CreateOrganizationUseCase } from "@/core/use-cases/organization/CreateOrganization";
import { GetAuditAnalyticsUseCase } from "@/core/use-cases/audit/GetAuditAnalytics";
import { StartMigrationJobUseCase } from "@/core/use-cases/migration/StartMigrationJob";
import { CheckActiveSubscriptionUseCase } from "@/core/use-cases/billing/CheckActiveSubscription";

function getEncryption(): ApiKeyEncryption {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("ENCRYPTION_SECRET environment variable is not set");
  }
  return new ApiKeyEncryption(secret);
}

export function buildContainer() {
  const db = createServiceClient();
  const encryption = getEncryption();

  const orgRepo = new SupabaseOrganizationRepository(db);
  const repoRepo = new SupabaseRepositoryRepository(db);
  const apiKeyRepo = new SupabaseApiKeyRepository(db);
  const auditRepo = new SupabaseAuditRepository(db);
  const migrationRepo = new SupabaseMigrationRepository(db);
  const subscriptionRepo = new SupabaseSubscriptionRepository(db);

  return {
    repos: {
      orgRepo,
      repoRepo,
      apiKeyRepo,
      auditRepo,
      migrationRepo,
      subscriptionRepo,
    },
    useCases: {
      storeApiKey: new StoreApiKeyUseCase(apiKeyRepo, encryption),
      getDecryptedApiKey: new GetDecryptedApiKeyUseCase(apiKeyRepo, encryption),
      createOrganization: new CreateOrganizationUseCase(orgRepo),
      getAuditAnalytics: new GetAuditAnalyticsUseCase(auditRepo),
      startMigrationJob: new StartMigrationJobUseCase(migrationRepo),
      checkSubscription: new CheckActiveSubscriptionUseCase(subscriptionRepo),
    },
    encryption,
  };
}

export type AppContainer = ReturnType<typeof buildContainer>;
