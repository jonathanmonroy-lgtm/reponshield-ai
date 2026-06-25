"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  GitPullRequest,
  Lock,
  Plus,
  RefreshCw,
  Unlock,
  Webhook,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

interface DemoRepo {
  id: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  webhookActive: boolean;
  auditEnabled: boolean;
  auditCount: number;
  lastAuditAt: Date | null;
}

const DEMO_REPOS: DemoRepo[] = [
  {
    id: "1",
    fullName: "acme-corp/backend-api",
    defaultBranch: "main",
    isPrivate: true,
    webhookActive: true,
    auditEnabled: true,
    auditCount: 34,
    lastAuditAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: "2",
    fullName: "acme-corp/frontend-app",
    defaultBranch: "main",
    isPrivate: false,
    webhookActive: true,
    auditEnabled: true,
    auditCount: 13,
    lastAuditAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
  {
    id: "3",
    fullName: "acme-corp/legacy-monolith",
    defaultBranch: "master",
    isPrivate: true,
    webhookActive: false,
    auditEnabled: false,
    auditCount: 0,
    lastAuditAt: null,
  },
];

export default function RepositoriesPage() {
  const [repos] = useState(DEMO_REPOS);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Repositories</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage connected GitHub repositories and audit settings.
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4" />
          Connect Repository
        </Button>
      </div>

      <Alert variant="info" title="Webhook setup">
        After connecting a repository, RepoShield automatically registers a
        GitHub webhook. Every pull_request event triggers an AI audit.
      </Alert>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {repos.map((repo) => (
          <Card key={repo.id} className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-5 w-5 text-gray-400 shrink-0" />
                  <CardTitle className="text-base">{repo.fullName}</CardTitle>
                </div>
                {repo.isPrivate ? (
                  <Lock className="h-4 w-4 text-gray-400 shrink-0" />
                ) : (
                  <Unlock className="h-4 w-4 text-gray-400 shrink-0" />
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={repo.webhookActive ? "success" : "default"}>
                  <Webhook className="mr-1 h-3 w-3" />
                  {repo.webhookActive ? "Webhook active" : "No webhook"}
                </Badge>
                <Badge variant={repo.auditEnabled ? "success" : "warning"}>
                  {repo.auditEnabled ? "Audit on" : "Audit off"}
                </Badge>
                <Badge variant="default">
                  {repo.defaultBranch}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>{repo.auditCount} audits</span>
                <span>
                  {repo.lastAuditAt
                    ? `Last: ${formatRelativeTime(repo.lastAuditAt)}`
                    : "Never audited"}
                </span>
              </div>

              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <Button variant="outline" size="sm" className="flex-1">
                  View Audits
                </Button>
                <Button variant="ghost" size="sm">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
