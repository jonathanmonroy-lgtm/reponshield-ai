-- RepoShield AI — Audit Logs Table (Migration 002)
-- Append-only ledger that drives the "failures prevented" dashboard metric.
-- Each successful webhook audit writes one row here; the dashboard aggregates
-- prevented_issues (critical + high findings) across all rows for the org.

create table public.audit_logs (
  id                 uuid        primary key default gen_random_uuid(),
  organization_id    uuid        not null references public.organizations(id) on delete cascade,
  repository_id      uuid        not null references public.repositories(id) on delete cascade,
  audit_id           uuid        not null references public.pull_request_audits(id) on delete cascade,
  pr_number          integer     not null,
  pr_title           text        not null,
  pr_author          text        not null,
  findings_count     integer     not null default 0,
  critical_count     integer     not null default 0,
  high_count         integer     not null default 0,
  medium_count       integer     not null default 0,
  low_count          integer     not null default 0,
  info_count         integer     not null default 0,
  security_score     integer     not null default 100 check (security_score between 0 and 100),
  total_debt_minutes integer     not null default 0,
  prevented_issues   integer     not null default 0,  -- critical_count + high_count
  ai_provider        text        not null,
  ai_model           text        not null,
  created_at         timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create index idx_audit_logs_org_id     on public.audit_logs(organization_id);
create index idx_audit_logs_repo_id    on public.audit_logs(repository_id);
create index idx_audit_logs_created_at on public.audit_logs(created_at desc);

-- Org members may read their own org's log entries
create policy "audit_logs_members_read"
  on public.audit_logs for select
  using (public.is_org_member(organization_id));

-- Service role (webhook handler) may insert without a user session
create policy "audit_logs_service_insert"
  on public.audit_logs for insert
  with check (true);
