import Link from "next/link";
import { Shield, GitPullRequest, RefreshCw, Key, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

const features = [
  {
    icon: <GitPullRequest className="h-6 w-6 text-indigo-600" />,
    title: "Audit Motor",
    description:
      "Automatically analyzes every Pull Request diff with AI. Posts inline code review comments with OWASP findings, technical debt metrics, and fix suggestions — in seconds.",
  },
  {
    icon: <RefreshCw className="h-6 w-6 text-indigo-600" />,
    title: "Migration Motor",
    description:
      "Upload legacy JS/Python/PHP code and receive production-ready TypeScript with full type safety, async/await patterns, and a complete Vitest test suite.",
  },
  {
    icon: <Key className="h-6 w-6 text-indigo-600" />,
    title: "Bring Your Own Key",
    description:
      "Connect your own OpenAI or Anthropic API key. Keys are encrypted with AES-256-GCM before storage — your models, your data, zero vendor lock-in.",
  },
];

const stats = [
  { label: "OWASP Categories Detected", value: "10+" },
  { label: "Languages Supported", value: "3" },
  { label: "AI Providers", value: "2" },
  { label: "Avg Audit Time", value: "<30s" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-indigo-600" />
            <span className="text-lg font-bold text-gray-900">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/register">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-indigo-50 to-white px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5">
            <Shield className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-medium text-indigo-700">
              AI Code Security &amp; Migration Platform
            </span>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
            Audit Every PR.
            <br />
            <span className="text-indigo-600">Modernize Legacy Code.</span>
          </h1>
          <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto">
            RepoShield AI audits your GitHub Pull Requests for security
            vulnerabilities, technical debt, and compliance gaps — then posts
            exact-line comments with AI-powered fixes. BYOK privacy guaranteed.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <Link href="/auth/register">
                Start Free Trial
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/dashboard">View Demo Dashboard</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-100 bg-gray-50 py-12">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-4xl font-bold text-indigo-600">{stat.value}</p>
              <p className="mt-1 text-sm text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Two Powerful Engines, One Platform
          </h2>
          <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-indigo-600 px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-white">
            Ready to shield your codebase?
          </h2>
          <p className="mt-4 text-indigo-200">
            Connect GitHub in minutes. First 100 audits free. No credit card required.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Button
              size="lg"
              className="bg-white text-indigo-700 hover:bg-indigo-50"
              asChild
            >
              <Link href="/auth/register">
                Create Free Account
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-8">
            {[
              "OWASP Top 10 Detection",
              "AES-256-GCM Key Encryption",
              "Zero Data Retention",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-indigo-200">
                <CheckCircle2 className="h-4 w-4 text-indigo-300" />
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} {APP_NAME}. Built with Next.js 16,
            Supabase &amp; Claude Sonnet.
          </p>
        </div>
      </footer>
    </div>
  );
}
