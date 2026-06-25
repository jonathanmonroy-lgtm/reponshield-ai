# RepoShield AI 🛡️ — Autonomous AI Code Governance & Migration SaaS

RepoShield AI is an enterprise-grade B2B SaaS platform designed under Clean Architecture and Domain-Driven Design (DDD) principles. It offers businesses an automated solution to audit technical debt, ensure OWASP security compliance in pull requests, and migrate legacy code seamlessly—all under a **BYOK (Bring Your Own Key)** infrastructure model, resulting in $0 operational AI costs for the platform owner.

## 🚀 Key Features

- **Autonomous PR Auditor:** Intercepts GitHub webhooks, validates cryptographic signatures (`X-Hub-Signature-256`), parses git diffs, and leverages commercial LLMs (Anthropic/OpenAI) to post inline review comments directly on lines with architectural flaws, technical debt, or vulnerabilities.
- **Legacy Migration Engine:** Recursively maps legacy code dependency trees (AST analysis) and safely refactors untyped JS, old Python, or legacy PHP into strict, modern TypeScript with automated unit tests.
- **Enterprise-Grade Security:** Strict Row-Level Security (RLS) on Supabase, end-to-end encryption (AES-256-GCM) for client API keys stored in-memory, and zero-leak logging principles.
- **Rock-Solid Reliability:** Built with strict TypeScript typing, achieving a production-ready build verified by a comprehensive suite of **93 automated integration and unit tests** running on Vitest.

## 🏗️ Architecture Design (Clean Architecture + DDD)

The project strictly separates concerns to ensure that enterprise-level scaling, multi-tenancy, and framework migrations can be executed without breaking core business rules:

```text
src/
  ├── core/            # Domain: Entities, use cases, repository contracts
  ├── infrastructure/  # Adapters: Supabase, GitHub API, LLMs, Encryption
  ├── services/        # Services: AST parsers, migration, diff analyzers
  └── app/             # Next.js: Secure Multi-tenant Dashboard & API Routes