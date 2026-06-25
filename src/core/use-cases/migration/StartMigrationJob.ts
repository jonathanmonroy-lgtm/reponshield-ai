import type { IMigrationRepository } from "@/core/repositories/IMigrationRepository";
import {
  validateMigrationInput,
  type MigrationJob,
  type CreateMigrationJobInput,
} from "@/core/entities/MigrationJob";
import { err } from "@/lib/types";
import type { Result } from "@/lib/types";

export class StartMigrationJobUseCase {
  constructor(private readonly migrationRepo: IMigrationRepository) {}

  async execute(
    input: CreateMigrationJobInput
  ): Promise<Result<MigrationJob>> {
    const validationError = validateMigrationInput(input);
    if (validationError) return err(validationError);

    return this.migrationRepo.create(input);
  }
}
