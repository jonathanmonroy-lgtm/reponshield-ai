export const APP_NAME = "RepoShield AI";
export const APP_VERSION = "1.0.0";

export const GITHUB_API_BASE = "https://api.github.com";
export const WEBHOOK_PATH = "/api/webhooks/github";

export const AI_PROVIDERS = {
  openai: { name: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] },
  anthropic: {
    name: "Anthropic",
    models: [
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
      "claude-opus-4-8",
    ],
  },
  gemini: {
    name: "Google Gemini",
    models: ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
  },
} as const;

export const DEFAULT_AI_MODEL: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-6",
  gemini: "gemini-2.5-flash",
};

export const MAX_DIFF_TOKENS = 8000;
export const MAX_FILE_SIZE_BYTES = 500_000;
export const MAX_DIFF_SIZE_BYTES = 5_000_000; // 5 MB hard cap — prevents OOM on adversarial payloads
export const WEBHOOK_TIMEOUT_MS = 25_000;
export const AI_REQUEST_TIMEOUT_MS = 60_000;
export const MAX_AI_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1_000;
export const RETRY_MAX_DELAY_MS = 30_000;

export const OWASP_TOP_10 = [
  "A01:2021 - Broken Access Control",
  "A02:2021 - Cryptographic Failures",
  "A03:2021 - Injection",
  "A04:2021 - Insecure Design",
  "A05:2021 - Security Misconfiguration",
  "A06:2021 - Vulnerable and Outdated Components",
  "A07:2021 - Identification and Authentication Failures",
  "A08:2021 - Software and Data Integrity Failures",
  "A09:2021 - Security Logging and Monitoring Failures",
  "A10:2021 - Server-Side Request Forgery",
] as const;

export const TECHNICAL_DEBT_CATEGORIES = [
  "code_duplication",
  "high_complexity",
  "missing_types",
  "missing_tests",
  "deprecated_patterns",
  "poor_error_handling",
  "magic_numbers",
  "deep_nesting",
] as const;

export const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-600 bg-red-50 border-red-200",
  high: "text-orange-600 bg-orange-50 border-orange-200",
  medium: "text-yellow-600 bg-yellow-50 border-yellow-200",
  low: "text-blue-600 bg-blue-50 border-blue-200",
  info: "text-gray-600 bg-gray-50 border-gray-200",
};
