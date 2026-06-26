export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          github_installation_id: string | null;
          preferred_ai_provider: string;
          preferred_ai_model: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          github_installation_id?: string | null;
          preferred_ai_provider?: string;
          preferred_ai_model?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          github_installation_id?: string | null;
          preferred_ai_provider?: string;
          preferred_ai_model?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: "owner" | "admin" | "member";
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: "owner" | "admin" | "member";
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: "owner" | "admin" | "member";
          created_at?: string;
        };
        Relationships: [];
      };
      repositories: {
        Row: {
          id: string;
          organization_id: string;
          github_repo_id: number;
          full_name: string;
          default_branch: string;
          is_private: boolean;
          webhook_id: number | null;
          webhook_active: boolean;
          audit_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          github_repo_id: number;
          full_name: string;
          default_branch?: string;
          is_private?: boolean;
          webhook_id?: number | null;
          webhook_active?: boolean;
          audit_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          github_repo_id?: number;
          full_name?: string;
          default_branch?: string;
          is_private?: boolean;
          webhook_id?: number | null;
          webhook_active?: boolean;
          audit_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      api_keys: {
        Row: {
          id: string;
          organization_id: string;
          provider: string;
          encrypted_key: string;
          key_hint: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          provider: string;
          encrypted_key: string;
          key_hint: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          provider?: string;
          encrypted_key?: string;
          key_hint?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pull_request_audits: {
        Row: {
          id: string;
          repository_id: string;
          pr_number: number;
          pr_title: string;
          pr_author: string;
          head_sha: string;
          base_sha: string;
          findings: unknown;
          total_debt_minutes: number;
          security_score: number;
          maintainability_score: number;
          github_comment_ids: number[];
          ai_provider: string;
          ai_model: string;
          processing_ms: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          repository_id: string;
          pr_number: number;
          pr_title: string;
          pr_author: string;
          head_sha: string;
          base_sha: string;
          findings?: unknown;
          total_debt_minutes?: number;
          security_score?: number;
          maintainability_score?: number;
          github_comment_ids?: number[];
          ai_provider: string;
          ai_model: string;
          processing_ms?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          repository_id?: string;
          pr_number?: number;
          pr_title?: string;
          pr_author?: string;
          head_sha?: string;
          base_sha?: string;
          findings?: unknown;
          total_debt_minutes?: number;
          security_score?: number;
          maintainability_score?: number;
          github_comment_ids?: number[];
          ai_provider?: string;
          ai_model?: string;
          processing_ms?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          status: string;
          plan_type: string;
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          status: string;
          plan_type: string;
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          stripe_customer_id?: string;
          stripe_subscription_id?: string;
          status?: string;
          plan_type?: string;
          current_period_start?: string;
          current_period_end?: string;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string;
          repository_id: string;
          audit_id: string;
          pr_number: number;
          pr_title: string;
          pr_author: string;
          findings_count: number;
          critical_count: number;
          high_count: number;
          medium_count: number;
          low_count: number;
          info_count: number;
          security_score: number;
          total_debt_minutes: number;
          prevented_issues: number;
          ai_provider: string;
          ai_model: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          repository_id: string;
          audit_id: string;
          pr_number: number;
          pr_title: string;
          pr_author: string;
          findings_count?: number;
          critical_count?: number;
          high_count?: number;
          medium_count?: number;
          low_count?: number;
          info_count?: number;
          security_score?: number;
          total_debt_minutes?: number;
          prevented_issues?: number;
          ai_provider: string;
          ai_model: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          repository_id?: string;
          audit_id?: string;
          pr_number?: number;
          pr_title?: string;
          pr_author?: string;
          findings_count?: number;
          critical_count?: number;
          high_count?: number;
          medium_count?: number;
          low_count?: number;
          info_count?: number;
          security_score?: number;
          total_debt_minutes?: number;
          prevented_issues?: number;
          ai_provider?: string;
          ai_model?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      migration_jobs: {
        Row: {
          id: string;
          organization_id: string;
          status: string;
          source_language: string;
          files: unknown;
          total_files: number;
          processed_files: number;
          ai_provider: string;
          ai_model: string;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          status?: string;
          source_language: string;
          files?: unknown;
          total_files?: number;
          processed_files?: number;
          ai_provider: string;
          ai_model: string;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          status?: string;
          source_language?: string;
          files?: unknown;
          total_files?: number;
          processed_files?: number;
          ai_provider?: string;
          ai_model?: string;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
