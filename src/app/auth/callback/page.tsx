"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Shield } from "lucide-react";
import { getSupabaseClient } from "@/infrastructure/database/supabase/client";

function CallbackHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const oauthError = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (oauthError) {
      const message = errorDescription ?? oauthError;
      window.location.href = `/auth/login?error=${encodeURIComponent(message)}`;
      return;
    }

    const code = searchParams.get("code");
    if (!code) {
      window.location.href = "/auth/login?error=missing_code";
      return;
    }

    getSupabaseClient()
      .auth.exchangeCodeForSession(code)
      .then(({ error: sessionError }) => {
        if (sessionError) {
          window.location.href = `/auth/login?error=${encodeURIComponent(sessionError.message)}`;
        } else {
          window.location.href = "/dashboard";
        }
      });
  }, [searchParams]);

  return null;
}

export default function AuthCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <Shield className="h-10 w-10 animate-pulse text-indigo-600" />
        <p className="text-sm text-gray-500">Completing sign in with GitHub…</p>
      </div>
      <Suspense>
        <CallbackHandler />
      </Suspense>
    </div>
  );
}
