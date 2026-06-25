"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ApiKeyForm } from "@/components/settings/ApiKeyForm";
import { Select } from "@/components/ui/select";
import { AI_PROVIDERS } from "@/lib/constants";

const DEMO_ORG_ID = "demo-org-123";

const DEMO_EXISTING_KEYS = [
  {
    id: "key-1",
    provider: "openai" as const,
    keyHint: "sk-...abc1",
    isActive: true,
    updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
];

const modelOptions = Object.entries(AI_PROVIDERS).flatMap(([_provider, cfg]) =>
  cfg.models.map((model) => ({
    value: model,
    label: `${cfg.name} — ${model}`,
  }))
);

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your BYOK API keys and AI provider preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ApiKeyForm
          organizationId={DEMO_ORG_ID}
          existingKeys={DEMO_EXISTING_KEYS}
          onKeySaved={() => {}}
        />

        <Card>
          <CardHeader>
            <CardTitle>AI Provider Preferences</CardTitle>
            <CardDescription>
              Choose the default model for audit and migration operations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              label="Default Model"
              id="default-model"
              options={modelOptions}
              defaultValue="claude-sonnet-4-6"
            />
            <p className="mt-3 text-xs text-gray-500">
              Per-repository overrides can be set in repository settings.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
