import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodeMigrationService } from "./CodeMigrationService";
import type { IAIProvider, AICompletionResult } from "@/infrastructure/ai/IAIProvider";
import type { IMigrationRepository } from "@/core/repositories/IMigrationRepository";
import type { MigrationJob, MigrationFile } from "@/core/entities/MigrationJob";
import { ok } from "@/lib/types";

const MIGRATED_RESPONSE = JSON.stringify({
  migratedCode: "export const x: number = 1;",
  testCode: "import { expect } from 'vitest'; expect(1).toBe(1);",
  summary: "Added TypeScript types.",
  linesChanged: 3,
  detectedDependencies: [],
});

function makeMockProvider(content = MIGRATED_RESPONSE): IAIProvider {
  return {
    providerName: "openai",
    complete: vi.fn<IAIProvider["complete"]>().mockResolvedValue({
      content,
      inputTokens: 50,
      outputTokens: 100,
      model: "gpt-4o",
    } satisfies AICompletionResult),
  };
}

function makeBaseJob(overrides: Partial<MigrationJob> = {}): MigrationJob {
  return {
    id: "job-1",
    organizationId: "org-1",
    status: "pending",
    sourceLanguage: "javascript",
    files: [
      {
        originalPath: "src/a.js",
        originalContent: "var x = 1;",
        migratedContent: null,
        testContent: null,
        dependencies: [],
        linesChanged: 0,
      },
      {
        originalPath: "src/b.js",
        originalContent: "function add(a, b) { return a + b; }",
        migratedContent: null,
        testContent: null,
        dependencies: [],
        linesChanged: 0,
      },
    ],
    totalFiles: 2,
    processedFiles: 0,
    aiProvider: "openai",
    aiModel: "gpt-4o",
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeMockRepo(job: MigrationJob): IMigrationRepository {
  const completedJob: MigrationJob = {
    ...job,
    status: "completed",
    processedFiles: job.files.length,
    completedAt: new Date(),
  };

  return {
    findById: vi.fn().mockResolvedValue(ok(job)),
    findByOrganizationId: vi.fn().mockResolvedValue(ok([])),
    create: vi.fn().mockResolvedValue(ok(job)),
    updateStatus: vi.fn().mockResolvedValue(ok(undefined)),
    updateProgress: vi.fn().mockResolvedValue(ok(undefined)),
    markCompleted: vi.fn().mockResolvedValue(ok(completedJob)),
  };
}

describe("CodeMigrationService", () => {
  let provider: IAIProvider;
  let repo: IMigrationRepository;
  let job: MigrationJob;
  let service: CodeMigrationService;

  beforeEach(() => {
    job = makeBaseJob();
    provider = makeMockProvider();
    repo = makeMockRepo(job);
    service = new CodeMigrationService(provider, "gpt-4o", repo);
  });

  it("sets job status to processing before migrating files", async () => {
    await service.processJob("job-1");
    expect(repo.updateStatus).toHaveBeenCalledWith("job-1", "processing");
  });

  it("calls provider.complete once per file", async () => {
    await service.processJob("job-1");
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it("calls markCompleted with all processed files", async () => {
    await service.processJob("job-1");
    expect(repo.markCompleted).toHaveBeenCalledOnce();
    const [, files] = vi.mocked(repo.markCompleted).mock.calls[0]!;
    expect(files).toHaveLength(2);
  });

  it("stores migratedContent in completed files", async () => {
    await service.processJob("job-1");
    const [, files] = vi.mocked(repo.markCompleted).mock.calls[0]!;
    expect((files as MigrationFile[])[0]?.migratedContent).toContain("const x: number");
  });

  it("stores testContent in completed files", async () => {
    await service.processJob("job-1");
    const [, files] = vi.mocked(repo.markCompleted).mock.calls[0]!;
    expect((files as MigrationFile[])[0]?.testContent).toContain("vitest");
  });

  it("calls updateProgress after each chunk", async () => {
    const bigJob = makeBaseJob({
      files: Array.from({ length: 4 }, (_, i) => ({
        originalPath: `src/file${i}.js`,
        originalContent: `var x${i} = ${i};`,
        migratedContent: null,
        testContent: null,
        dependencies: [],
        linesChanged: 0,
      })),
      totalFiles: 4,
    });
    const bigRepo = makeMockRepo(bigJob);
    const bigService = new CodeMigrationService(provider, "gpt-4o", bigRepo);

    await bigService.processJob("job-1");

    // 4 files / CONCURRENCY=3 → 2 chunks → 2 updateProgress calls
    expect(bigRepo.updateProgress).toHaveBeenCalledTimes(2);
  });

  it("handles partial failure gracefully — successful files still saved", async () => {
    const failOnSecondProvider: IAIProvider = {
      providerName: "openai",
      complete: vi
        .fn<IAIProvider["complete"]>()
        .mockResolvedValueOnce({
          content: MIGRATED_RESPONSE,
          inputTokens: 50,
          outputTokens: 100,
          model: "gpt-4o",
        })
        .mockRejectedValueOnce(new Error("Rate limited")),
    };

    const partialService = new CodeMigrationService(failOnSecondProvider, "gpt-4o", repo);
    await partialService.processJob("job-1");

    const [, files] = vi.mocked(repo.markCompleted).mock.calls[0]!;
    const typedFiles = files as MigrationFile[];

    expect(typedFiles).toHaveLength(2);
    expect(typedFiles[0]?.migratedContent).not.toBeNull();
    expect(typedFiles[1]?.migratedContent).toBeNull();
  });

  it("returns err when job is not found", async () => {
    const emptyRepo: IMigrationRepository = {
      ...repo,
      findById: vi.fn().mockResolvedValue(ok(null)),
    };
    const notFoundService = new CodeMigrationService(provider, "gpt-4o", emptyRepo);
    const result = await notFoundService.processJob("missing-id");
    expect(result.success).toBe(false);
  });

  it("passes correct model to provider on each file", async () => {
    const modelService = new CodeMigrationService(provider, "claude-sonnet-4-6", repo);
    await modelService.processJob("job-1");

    const calls = vi.mocked(provider.complete).mock.calls;
    expect(calls.every((c) => c[0].model === "claude-sonnet-4-6")).toBe(true);
  });

  it("uses low temperature (0.05) for deterministic migration output", async () => {
    await service.processJob("job-1");
    const calls = vi.mocked(provider.complete).mock.calls;
    expect(calls.every((c) => c[0].temperature === 0.05)).toBe(true);
  });

  it("requests json_object response format for each file", async () => {
    await service.processJob("job-1");
    const calls = vi.mocked(provider.complete).mock.calls;
    expect(calls.every((c) => c[0].responseFormat === "json_object")).toBe(true);
  });
});
