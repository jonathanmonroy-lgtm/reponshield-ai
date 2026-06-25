# RepoShield AI — Engineering Standards

## Project Overview
SaaS B2B platform that audits GitHub Pull Requests with AI (BYOK) and migrates legacy code to TypeScript.
Two engines: **Audit Motor** (webhook → diff → AI → PR comments) and **Migration Motor** (legacy code → AST → TypeScript + tests).
Stack: Next.js 16, React 19, TypeScript 5 strict, Tailwind CSS 4, Supabase, Vitest.

## Build & Dev Commands
```bash
npm run dev           # Start dev server (Next.js, port 3000)
npm run build         # Production build — must pass with 0 errors
npm run lint          # ESLint — must pass with 0 warnings
npm run typecheck     # tsc --noEmit — must pass with 0 errors
npm test              # Vitest unit + integration tests
npm run test:ui       # Vitest with browser UI
npm run test:coverage # Coverage report (target: >80%)
```

## Code Style — Enforced by ESLint + TypeScript strict
- **TypeScript strict mode** (`strict: true`). Never use `any`. Use `unknown` + type narrowing.
- **Absolute imports** via `@/` alias (maps to `src/`). No relative `../` imports beyond same directory.
- **Errors**: Always handle errors explicitly. Use typed error classes. No silent `catch` blocks.
- **Async**: Always `await` Promises. No floating Promises. Use `Promise.allSettled` for multiple results.
- **No TODOs, no placeholders**: Every function must have production-complete logic.
- **Naming**: `PascalCase` for classes/types/interfaces, `camelCase` for functions/variables, `SCREAMING_SNAKE_CASE` for constants, `kebab-case` for files.
- **Exports**: Named exports everywhere. Default exports only for Next.js pages/layouts.
- **Comments**: Only when WHY is non-obvious (hidden constraint, OWASP reference). No what-comments.

## Architecture — Clean Architecture + DDD
```
src/
  core/           # Domain layer: entities, repository interfaces, use cases (ZERO external deps)
  infrastructure/ # Adapters: Supabase, GitHub API, AI providers, encryption
  services/       # Application services: DiffAnalyzer, ASTParser, CodeMigration
  app/            # Next.js App Router: pages + API routes
  components/     # React UI components (ui/ = shadcn primitives)
  lib/            # Shared utilities, constants, types
```

- **Dependency rule**: `core/` NEVER imports from `infrastructure/`, `services/`, or `app/`.
- Use cases receive repository interfaces via constructor injection.
- AI providers implement `IAIProvider` — swappable per-organization BYOK key.

## Environment Variables (`.env.local` — never committed)
See `.env.example` for all required keys:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, full DB access
- `ENCRYPTION_SECRET` — 32-byte hex for AES-256-GCM client API key encryption
- `GITHUB_WEBHOOK_SECRET` — X-Hub-Signature-256 verification

## Security Requirements
- GitHub webhook signatures verified with `crypto.timingSafeEqual` before any processing.
- Client API keys encrypted with AES-256-GCM before Supabase storage; decrypted in-memory only.
- All Supabase queries protected by Row Level Security (RLS) policies.
- No secrets logged. Any log output involving keys must be masked.

## Testing (Vitest)
- Test files: `*.test.ts` / `*.test.tsx` colocated or in `tests/`.
- Mock all external I/O (Supabase, GitHub, OpenAI, Anthropic) — never call real endpoints.
- Required coverage: `DiffAnalyzer`, `GitHubWebhookVerifier`, `ApiKeyEncryption`, prompt builders.
