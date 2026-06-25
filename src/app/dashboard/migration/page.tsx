"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  Clock,
  Code2,
  FileCode2,
  RefreshCw,
  Upload,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import type { SourceLanguage } from "@/core/entities/MigrationJob";

const LANGUAGE_OPTIONS: Array<{ value: SourceLanguage; label: string }> = [
  { value: "javascript", label: "JavaScript (ES5/ES6)" },
  { value: "python", label: "Python (2/3 untyped)" },
  { value: "php", label: "PHP (5/7 legacy)" },
];

interface DemoJob {
  id: string;
  sourceLanguage: SourceLanguage;
  totalFiles: number;
  processedFiles: number;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Date;
}

const DEMO_JOBS: DemoJob[] = [
  {
    id: "job-1",
    sourceLanguage: "javascript",
    totalFiles: 12,
    processedFiles: 12,
    status: "completed",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    id: "job-2",
    sourceLanguage: "python",
    totalFiles: 7,
    processedFiles: 3,
    status: "processing",
    createdAt: new Date(Date.now() - 15 * 60 * 1000),
  },
];

const statusConfig = {
  pending: { label: "Pending", variant: "default" as const, icon: <Clock className="h-3 w-3" /> },
  processing: { label: "Processing", variant: "info" as const, icon: <RefreshCw className="h-3 w-3 animate-spin" /> },
  completed: { label: "Completed", variant: "success" as const, icon: <CheckCircle2 className="h-3 w-3" /> },
  failed: { label: "Failed", variant: "danger" as const, icon: null },
};

export default function MigrationPage() {
  const [language, setLanguage] = useState<SourceLanguage>("javascript");
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fileContent.trim() || !filePath.trim()) {
      setError("File path and content are required");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: "demo-org-123",
          sourceLanguage: language,
          files: [{ path: filePath, content: fileContent }],
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Failed to start migration");
        return;
      }
      setSubmitted(true);
      setFileContent("");
      setFilePath("");
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Migration Engine</h1>
        <p className="mt-1 text-sm text-gray-500">
          Transform legacy code into strict TypeScript with generated tests.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Submission form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-indigo-600" />
              Submit Code for Migration
            </CardTitle>
            <CardDescription>
              Paste your legacy code below. The AI will migrate it to TypeScript
              and generate a Vitest test suite automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Select
                label="Source Language"
                id="source-lang"
                options={LANGUAGE_OPTIONS}
                value={language}
                onChange={(e) =>
                  setLanguage(e.target.value as SourceLanguage)
                }
              />
              <Input
                label="File Path"
                id="file-path"
                placeholder="src/utils/helpers.js"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
              />
              <Textarea
                label="File Content"
                id="file-content"
                placeholder={`// Paste your legacy ${language} code here...`}
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="min-h-[200px] font-mono text-xs"
              />

              {error && <Alert variant="error">{error}</Alert>}
              {submitted && (
                <Alert variant="success" title="Migration job created">
                  Your file is queued for migration. Check the job list below
                  for progress.
                </Alert>
              )}

              <Button type="submit" loading={isSubmitting}>
                <Code2 className="h-4 w-4" />
                Start Migration
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Recent jobs */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y divide-gray-100">
              {DEMO_JOBS.map((job) => {
                const cfg = statusConfig[job.status];
                const progress = Math.round(
                  (job.processedFiles / job.totalFiles) * 100
                );

                return (
                  <div key={job.id} className="flex flex-col gap-3 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCode2 className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {job.sourceLanguage} → TypeScript
                        </span>
                      </div>
                      <Badge variant={cfg.variant}>
                        {cfg.icon}
                        <span className="ml-1">{cfg.label}</span>
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {job.processedFiles}/{job.totalFiles} files
                      </span>
                      <span>{formatRelativeTime(job.createdAt)}</span>
                    </div>

                    <div className="w-full overflow-hidden rounded-full bg-gray-100 h-1.5">
                      <div
                        className={`h-full rounded-full transition-all ${
                          job.status === "completed"
                            ? "bg-green-500"
                            : job.status === "processing"
                            ? "bg-indigo-500"
                            : "bg-gray-300"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    {job.status === "completed" && (
                      <Button variant="outline" size="sm">
                        Download TypeScript + Tests
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
