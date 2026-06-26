# RepoShield AI — Technical Reference

> Complete engineering documentation for the RepoShield AI platform: architecture, data flows, cryptographic design, and operational runbook.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Clean Architecture](#2-clean-architecture)
3. [GitHub Webhook Data Flow](#3-github-webhook-data-flow)
4. [BYOK Cryptographic Scheme (AES-256-GCM)](#4-byok-cryptographic-scheme-aes-256-gcm)
5. [Database Schema](#5-database-schema)
6. [Environment Variables](#6-environment-variables)
7. [Running the Interactive Demo](#7-running-the-interactive-demo)
8. [Test Suite](#8-test-suite)
9. [Security Properties](#9-security-properties)

---

## 1. System Overview

RepoShield AI is a SaaS B2B platform with two autonomous engines:

| Engine | Trigger | Output |
|--------|---------|--------|
| **Audit Motor** | GitHub `pull_request` webhook | AI-generated review comments posted to the PR; audit record persisted in Supabase |
| **Migration Motor** | REST API call | Legacy JS/Python/PHP files converted to TypeScript with generated tests |

Organizations supply their own AI provider keys (OpenAI or Anthropic) — a model known as **Bring Your Own Key (BYOK)**. Keys are encrypted with AES-256-GCM before storage and decrypted in-memory only at request time.

---

## 2. Clean Architecture

The codebase follows **Clean Architecture** with strict inward-only dependency flow and **Domain-Driven Design (DDD)** for the business layer.

### 2.1 Layer Map

```
┌─────────────────────────────────────────────────────┐
│                    app/ (HTTP layer)                │
│   Next.js API routes · pages · React components    │
└──────────────────────┬──────────────────────────────┘
                       │ depends on ↓
┌──────────────────────▼──────────────────────────────┐
│              services/ (Domain Services)            │
│   DiffAnalyzer · AuditAIEngine · AutoFixEngine     │
│   CodeMigrationService · ASTParser                 │
└──────────────────────┬──────────────────────────────┘
                       │ depends on ↓
┌──────────────────────▼──────────────────────────────┐
│           infrastructure/ (Adapters)                │
│   SupabaseRepositories · GitHubApiClient           │
│   ApiKeyEncryption · OpenAIProvider                │
│   AnthropicProvider · GitHubWebhookVerifier        │
└──────────────────────┬──────────────────────────────┘
                       │ implements interfaces from ↓
┌──────────────────────▼──────────────────────────────┐
│                core/ (Domain Layer)                 │
│   Entities · Repository Interfaces · Use Cases     │
│         ZERO external dependencies                 │
└─────────────────────────────────────────────────────┘
```

**The golden rule**: `core/` never imports from any outer layer. All dependencies point inward. Outer layers depend on abstractions (interfaces) defined in `core/`, not on concrete implementations.

### 2.2 Directory Responsibilities

```
src/
├── core/
│   ├── entities/          # Domain models with validation logic
│   ├── repositories/      # Interface contracts (no Supabase imports here)
│   └── use-cases/         # Orchestrate domain operations
│
├── infrastructure/
│   ├── database/supabase/ # Supabase concrete repository implementations
│   ├── encryption/        # AES-256-GCM key encryption
│   ├── github/            # Webhook verifier + GitHub REST client
│   └── ai/                # OpenAI + Anthropic provider adapters
│
├── services/
│   ├── audit/             # DiffAnalyzer, prompt builder, AI engine
│   ├── migration/         # AST parser, migration orchestrator
│   └── repair/            # Auto-fix PR generator (enterprise)
│
├── app/                   # Next.js App Router (pages + API routes)
├── components/            # React UI (dashboard, settings, shadcn primitives)
└── lib/
    ├── types.ts           # Shared Result<T>, SeverityLevel, AIProvider types
    ├── constants.ts       # OWASP mappings, audit category labels
    └── container.ts       # Dependency-injection container (single assembly point)
```

### 2.3 Dependency Injection

All concrete implementations are wired in `src/lib/container.ts` via `buildContainer()`. Every API route calls `buildContainer()` once per request, receives the fully assembled object graph, and uses it — no `new` statements scattered across routes.

```typescript
const { db, repos, useCases } = buildContainer();
// repos.auditRepo is a SupabaseAuditRepository behind the IAuditRepository interface
// useCases.getDecryptedApiKey owns the decryption logic
```

### 2.4 Result Type

Every repository method and use case returns `Result<T, E>` — a discriminated union that forces callers to handle both success and failure paths without exceptions leaking across layer boundaries.

```typescript
type Result<T, E = Error> =
  | { success: true;  data: T  }
  | { success: false; error: E }
```

---

## 3. GitHub Webhook Data Flow

### 3.1 End-to-End Sequence

```
GitHub                  RepoShield API                 Supabase        AI Provider
  │                          │                             │                │
  │── POST /webhooks/github ─►│                             │                │
  │   X-Hub-Signature-256     │                             │                │
  │                          │── HMAC-SHA256 verify ──────►│                │
  │                          │   timingSafeEqual            │                │
  │                          │                             │                │
  │                          │── findByGithubRepoId ───────►│                │
  │                          │◄── repo + org ──────────────│                │
  │                          │                             │                │
  │                          │── checkSubscription ────────►│                │
  │                          │◄── active / trialing ───────│                │
  │                          │                             │                │
  │                          │── getDecryptedApiKey ───────►│                │
  │                          │◄── plaintext key ───────────│                │
  │                          │   (AES-256-GCM decrypt)      │                │
  │                          │                             │                │
  │── getPullRequestDiff ────►│                             │                │
  │◄── unified diff ─────────│                             │                │
  │                          │                             │                │
  │                          │── DiffAnalyzer.parse() ──────────────────────│
  │                          │   ParsedDiff (files, chunks) │                │
  │                          │                             │                │
  │                          │── AuditAIEngine.analyze() ──────────────────►│
  │                          │   (prompt + diff payload)    │                │
  │                          │◄── AuditFinding[] JSON ──────────────────────│
  │                          │                             │                │
  │                          │── auditRepo.create() ───────►│                │
  │                          │   findings stored as JSONB   │                │
  │                          │                             │                │
  │                          │── audit_logs.insert() ──────►│                │
  │                          │   severity counts +          │                │
  │                          │   prevented_issues metric    │                │
  │                          │                             │                │
  │◄── postReviewComments ───│                             │                │
  │   (emoji-annotated)      │                             │                │
  │                          │                             │                │
  │◄── 200 { auditId,        │                             │                │
  │         findingsCount,   │                             │                │
  │         securityScore }  │                             │                │
  │                          │                             │                │
  │         [async]          │── AutoFixEngine (enterprise)────────────────►│
  │                          │   create branch + patch PR  │                │
```

### 3.2 Step-by-Step Description

| Step | Component | Detail |
|------|-----------|--------|
| 1 | `GitHubWebhookVerifier` | Computes `HMAC-SHA256(secret, rawBody)` and compares to the `X-Hub-Signature-256` header with `crypto.timingSafeEqual` to prevent timing attacks. |
| 2 | Event filter | Only `pull_request` events with actions `opened`, `synchronize`, or `reopened` proceed. All others return `{ received: true, skipped: true }`. |
| 3 | Repository lookup | The GitHub repository ID from the payload is used to find the registered `repositories` row and its parent organization. |
| 4 | Subscription gate | `CheckActiveSubscriptionUseCase` verifies the organization has an `active` or `trialing` Stripe subscription before any AI call. Returns HTTP 402 if not. |
| 5 | API key decryption | `GetDecryptedApiKeyUseCase` retrieves the encrypted key from Supabase and decrypts it in-memory. The plaintext never reaches the database again. |
| 6 | GitHub App token | `GitHubApiClient` creates a short-lived JWT (RS256, 10-minute expiry) to authenticate as the GitHub App, then exchanges it for an installation access token cached for 58 minutes. |
| 7 | Diff retrieval | The unified diff and PR metadata (`title`, `author`, `headSha`, `baseSha`) are fetched in a single parallel request pair. |
| 8 | Diff analysis | `DiffAnalyzer.parse()` converts the unified diff string into a structured `ParsedDiff` with per-file `chunks` and typed `lines` (add/del/context). |
| 9 | AI audit | `AuditAIEngine` sends the structured diff to the configured AI provider. `AuditPromptBuilder` encodes OWASP Top 10 references, severity rules, and a strict JSON response schema. |
| 10 | Persistence | `auditRepo.create()` stores the full finding set as a JSONB column in `pull_request_audits`. Scores are computed deterministically at insert time. |
| 11 | Audit log | One row is inserted into `audit_logs` with denormalized severity counts and `prevented_issues = critical_count + high_count` for fast dashboard aggregation. |
| 12 | Review comments | Findings are posted as inline GitHub review comments, annotated with severity emojis and OWASP references where applicable. |
| 13 | AutoFix (async) | For enterprise organizations with critical findings, `AutoFixEngine.triggerIfEligible()` fires without awaiting. It generates patch PRs via AI, opens a fix branch, and submits them — without blocking the webhook response. |

### 3.3 Security Score Computation

Security and maintainability scores are computed deterministically from finding severities at audit-creation time:

```
securityScore = max(0, 100 − Σ penalty(f) for security/compliance findings)

penalty mapping:
  critical  → 25 pts
  high      → 15 pts
  medium    →  8 pts
  low       →  3 pts
  info      →  1 pt

maintainabilityScore = max(0, 100 − floor(totalDebtMinutes / 10))
```

Both scores are stored as integers (0–100) with CHECK constraints in the database.

---

## 4. BYOK Cryptographic Scheme (AES-256-GCM)

### 4.1 Design Goals

- **Confidentiality**: AI provider keys stored in Supabase are unreadable without the application secret.
- **Integrity**: The GCM authentication tag detects any tampering with the ciphertext.
- **Key uniqueness**: Every encryption operation generates independent random salt and IV, so two encryptions of the same plaintext produce different ciphertexts.
- **No IV reuse**: AES-GCM is catastrophically broken if an (key, IV) pair is reused. Scrypt derives a fresh 256-bit key from a random 16-byte salt, making accidental IV reuse computationally negligible.

### 4.2 Algorithm

```
Inputs
  plaintext   : UTF-8 string (e.g., "sk-...")
  secret      : ENCRYPTION_SECRET env var (≥ 16 chars)

Step 1 — Random generation
  salt ← crypto.randomBytes(16)      // 128 bits
  iv   ← crypto.randomBytes(12)      //  96 bits (GCM recommended)

Step 2 — Key derivation (scrypt)
  key ← scryptSync(secret, salt, 32) // 256-bit derived key

Step 3 — Authenticated encryption
  cipher ← AES-256-GCM(key, iv, authTagLength=16)
  ciphertext ← cipher.update(plaintext, 'utf8') + cipher.final()
  authTag    ← cipher.getAuthTag()   // 128-bit GCM authentication tag

Step 4 — Wire encoding
  combined ← concat(salt[16] || iv[12] || authTag[16] || ciphertext[N])
  stored   ← base64url(combined)
```

### 4.3 Wire Format

```
┌──────────┬────────┬──────────┬───────────────────────────┐
│ salt     │ iv     │ authTag  │ ciphertext                │
│ 16 bytes │ 12 B   │ 16 bytes │ len(plaintext) bytes      │
└──────────┴────────┴──────────┴───────────────────────────┘
 ◄───────────────── base64url encoded ──────────────────────►
```

Minimum valid ciphertext length: 44 bytes (before base64url expansion). Shorter values are rejected by the decryptor before any cryptographic operation.

### 4.4 Decryption

```
Step 1 — Decode
  combined ← base64url_decode(storedValue)

Step 2 — Slice
  salt      ← combined[0:16]
  iv        ← combined[16:28]
  authTag   ← combined[28:44]
  ciphertext← combined[44:]

Step 3 — Key re-derivation
  key ← scryptSync(secret, salt, 32)

Step 4 — Authenticated decryption
  decipher ← AES-256-GCM(key, iv, authTagLength=16)
  decipher.setAuthTag(authTag)
  plaintext ← decipher.update(ciphertext) + decipher.final()
  // final() throws if the authentication tag does not match
```

If `decipher.final()` throws, the ciphertext was tampered with or the wrong `ENCRYPTION_SECRET` is in use. The error propagates as a typed failure in the `Result<T>` return from `GetDecryptedApiKeyUseCase`.

### 4.5 Security Properties

| Property | Mechanism |
|----------|-----------|
| 256-bit symmetric key | scrypt KDF with random 128-bit salt per encryption |
| Authenticated encryption | GCM auth tag rejects tampered ciphertext before any plaintext is produced |
| IV uniqueness | Independent 96-bit random IV per operation; scrypt also freshly derives key per operation |
| Secret rotation | Re-encrypt all keys with new secret; old ciphertexts cannot be decrypted without the old secret |
| No plaintext at rest | `encrypted_key` column in `api_keys` stores only the base64url blob; plaintext never written to DB |
| RLS guard | Supabase policy `apikey_members_read` restricts who can read `encrypted_key` rows; decryption still requires `ENCRYPTION_SECRET` which only the server process holds |

### 4.6 Implementation Reference

```
src/infrastructure/encryption/ApiKeyEncryption.ts
  ApiKeyEncryption.encrypt(plaintext) → Promise<string>
  ApiKeyEncryption.decrypt(ciphertext) → Promise<string>

src/core/use-cases/api-keys/StoreApiKey.ts
  StoreApiKeyUseCase.execute(orgId, provider, plaintextKey)
    → encrypts → upserts into api_keys

src/core/use-cases/api-keys/GetApiKey.ts
  GetDecryptedApiKeyUseCase.execute(orgId, provider)
    → fetches row → decrypts in-memory → returns plaintext
```

---

## 5. Database Schema

### 5.1 Entity Relationship Overview

```
organizations ─┬── organization_members (role: owner|admin|member)
               ├── repositories ──── pull_request_audits ──── audit_logs
               ├── api_keys (encrypted_key, AES-256-GCM)
               ├── subscriptions (Stripe)
               └── migration_jobs
```

### 5.2 Table Reference

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `organizations` | Tenant root | `slug`, `github_installation_id`, `preferred_ai_provider` |
| `organization_members` | RBAC | `role` (owner/admin/member), FK to `auth.users` |
| `repositories` | Registered GitHub repos | `github_repo_id`, `audit_enabled`, `webhook_active` |
| `api_keys` | BYOK encrypted keys | `encrypted_key` (AES-GCM blob), `key_hint` (last 4 chars) |
| `pull_request_audits` | Full audit records | `findings` (JSONB), `security_score`, `total_debt_minutes` |
| `audit_logs` | Dashboard metric ledger | `prevented_issues`, severity counts, `security_score` |
| `migration_jobs` | Async migration state | `status`, `files` (JSONB), `processed_files` |
| `subscriptions` | Stripe billing state | `plan_type` (starter/pro/enterprise), `status` |

### 5.3 Audit Logs Table

`audit_logs` is an **append-only denormalized ledger** designed for fast dashboard queries. It is written by the webhook handler after every successful audit and is never updated. Dashboards aggregate:

- `SUM(prevented_issues)` → total critical/high issues blocked
- `AVG(security_score)` → average score over time window
- `COUNT(*)` → total audits performed
- `SUM(total_debt_minutes)` → total technical debt identified

### 5.4 Row Level Security

All tables enforce RLS. The helper `public.is_org_member(org_id)` gates most read policies. Write operations from the webhook handler use the Supabase **service role key** (`SUPABASE_SERVICE_ROLE_KEY`) which bypasses RLS — this key is never exposed to the client.

```
SELECT policies  → require is_org_member()
INSERT policies  → service role (webhook) or is_org_member() (user-initiated)
UPDATE/DELETE    → require is_org_member() + owner/admin role
```

---

## 6. Environment Variables

All secrets live in `.env.local` (never committed). See `.env.example` for the full template.

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key — server-only, full DB access, bypasses RLS |
| `ENCRYPTION_SECRET` | Yes | Master secret for AES-256-GCM key derivation (≥ 16 chars; use 32-byte hex in production) |
| `GITHUB_WEBHOOK_SECRET` | Yes | Secret registered on the GitHub App for HMAC-SHA256 signature verification |
| `GITHUB_APP_ID` | Yes | GitHub App numeric ID |
| `GITHUB_APP_PRIVATE_KEY` | Yes | GitHub App RSA private key (PEM, newlines as `\n`) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key for subscription management |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |

---

## 7. Running the Interactive Demo

The demo runs a full simulated audit pipeline in the terminal — no live GitHub or AI credentials required. It uses a deterministic mock AI provider and a realistic sample diff.

### 7.1 Prerequisites

```bash
node --version   # ≥ 20 LTS recommended
npm install      # install all dependencies
```

### 7.2 Launch

```bash
npm run demo
```

The simulation runs `run-simulation.ts` via `tsx` and outputs a color-coded terminal UI showing:

1. **Webhook ingestion** — raw diff parsing and file breakdown
2. **AI analysis** — mocked findings with realistic severity distribution
3. **Scoring** — security score and maintainability score computation
4. **GitHub comment preview** — how review comments would appear on the PR
5. **Financial ROI panel** — estimated hours saved and debt prevented per plan tier
6. **Enterprise AutoFix panel** — simulated patch generation for critical findings

### 7.3 Demo Architecture

```
run-simulation.ts
  └── MockAIProvider (deterministic, no API calls)
       └── AuditAIEngine  (real code path)
            ├── DiffAnalyzer.parse()
            ├── AuditPromptBuilder.buildMessages()
            └── computeSecurityScore() / computeTotalDebt()
```

The demo exercises the real `DiffAnalyzer`, `AuditAIEngine`, and scoring functions — only the AI HTTP call is replaced by a deterministic mock that returns pre-authored findings. This means the demo output accurately reflects what production would produce for the same diff.

### 7.4 Dev Server

```bash
npm run dev       # Next.js dev server on http://localhost:3000
npm run build     # Production build (must pass with 0 errors)
npm run typecheck # TypeScript strict check (0 errors required)
npm run lint      # ESLint (0 warnings allowed)
```

---

## 8. Test Suite

Tests live in `*.test.ts` / `*.test.tsx` files co-located with source or under `tests/`. All external I/O (Supabase, GitHub, OpenAI, Anthropic) is mocked — the test suite never makes real network calls.

```bash
npm test              # Vitest unit + integration tests
npm run test:ui       # Vitest browser UI (interactive)
npm run test:coverage # Coverage report (target: >80%)
```

### 8.1 Critical Coverage Targets

| Module | What is tested |
|--------|---------------|
| `DiffAnalyzer` | Unified diff parsing edge cases, multi-file diffs, binary files |
| `GitHubWebhookVerifier` | Valid signatures, tampered payloads, missing headers, timing safety |
| `ApiKeyEncryption` | Round-trip encrypt/decrypt, short ciphertext rejection, wrong-secret error |
| `AuditPromptBuilder` | JSON schema compliance, OWASP reference injection, token truncation |
| `ProcessPullRequestAuditUseCase` | Full orchestration with mocked repos and AI engine |
| `AutoFixEngine` | Enterprise gate, non-enterprise skip, patch generation |

---

## 9. Security Properties

| Threat | Mitigation |
|--------|-----------|
| Forged GitHub webhooks | HMAC-SHA256 + `timingSafeEqual` on every request |
| AI key exfiltration from DB | AES-256-GCM application-layer encryption; service role required to read the column |
| Unauthorized API access | Supabase RLS on every table; organization membership checked per query |
| Timing attacks on signature comparison | `crypto.timingSafeEqual` used exclusively |
| Secret leakage in logs | No variable containing a key or secret is ever passed to `console.log` or error messages |
| Missing subscription billing | Subscription gate (HTTP 402) checked before any AI call or GitHub interaction |
| Injection via diff content | AI prompt treats diff as opaque user-controlled data; JSON schema response format prevents prompt injection from influencing finding structure |

---

*Generated for RepoShield AI — jonathan.monroy@puntored.co*
