"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Key, Trash2, CheckCircle2 } from "lucide-react";
import { AI_PROVIDERS } from "@/lib/constants";
import type { AIProvider } from "@/lib/types";

interface ExistingApiKey {
  id: string;
  provider: AIProvider;
  keyHint: string;
  isActive: boolean;
  updatedAt: Date;
}

interface ApiKeyFormProps {
  organizationId: string;
  existingKeys: ExistingApiKey[];
  onKeySaved: () => void;
}

const providerOptions = Object.entries(AI_PROVIDERS).map(([value, cfg]) => ({
  value,
  label: cfg.name,
}));

export function ApiKeyForm({
  organizationId,
  existingKeys,
  onKeySaved,
}: ApiKeyFormProps) {
  const [provider, setProvider] = useState<AIProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, provider, plaintextKey: apiKey }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Failed to save API key");
        return;
      }

      setSuccess(true);
      setApiKey("");
      onKeySaved();
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const response = await fetch(`/api/api-keys?id=${id}`, {
      method: "DELETE",
    });
    if (response.ok) onKeySaved();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-indigo-600" />
            Add API Key (BYOK)
          </CardTitle>
          <CardDescription>
            Your keys are encrypted with AES-256-GCM before storage. We never
            see your plaintext key after this form submission.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Select
              id="provider"
              label="AI Provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as AIProvider)}
              options={providerOptions}
            />
            <Input
              id="api-key"
              label="API Key"
              type="password"
              placeholder={
                provider === "openai" ? "sk-..." : "sk-ant-..."
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
            />

            {error && <Alert variant="error">{error}</Alert>}
            {success && (
              <Alert variant="success" title="Key saved">
                Your {provider} API key has been encrypted and stored securely.
              </Alert>
            )}

            <Button type="submit" loading={isSubmitting}>
              <CheckCircle2 className="h-4 w-4" />
              Save API Key
            </Button>
          </form>
        </CardContent>
      </Card>

      {existingKeys.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Stored Keys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y divide-gray-100">
              {existingKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-gray-400" />
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {key.provider}
                        </span>
                        <Badge variant={key.isActive ? "success" : "default"}>
                          {key.isActive ? "active" : "inactive"}
                        </Badge>
                      </div>
                      <span className="font-mono text-xs text-gray-500">
                        {key.keyHint}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(key.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
