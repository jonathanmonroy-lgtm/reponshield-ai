-- RepoShield AI — Initial Schema
-- Run in Supabase SQL Editor or via Supabase CLI: supabase db push

-- Enable pgcrypto for UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
create table public.organizations (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  slug                 text not null unique,
  github_installation_id text,
  preferred_ai_provider text not null default 'openai',
  preferred_ai_model   text not null default 'gpt-4o-mini',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- ============================================================
-- ORGANIZATION MEMBERS
-- ============================================================
create type public.member_role as enum ('owner', 'admin', 'member');

create table public.organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             public.member_role not null default 'member',
  created_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

alter table public.organization_members enable row level security;

-- ============================================================
-- REPOSITORIES
-- ============================================================
create table public.repositories (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  github_repo_id   bigint not null unique,
  full_name        text not null,
  default_branch   text not null default 'main',
  is_private       boolean not null default false,
  webhook_id       bigint,
  webhook_active   boolean not null default false,
  audit_enabled    boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.repositories enable row level security;

create index idx_repositories_org_id on public.repositories(organization_id);
create index idx_repositories_github_id on public.repositories(github_repo_id);

-- ============================================================
-- API KEYS (encrypted at application layer, AES-256-GCM)
-- ============================================================
create table public.api_keys (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  provider         text not null check (provider in ('openai', 'anthropic')),
  encrypted_key    text not null,
  key_hint         text not null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, provider)
);

alter table public.api_keys enable row level security;

create index idx_api_keys_org_provider on public.api_keys(organization_id, provider);

-- ============================================================
-- PULL REQUEST AUDITS
-- ============================================================
create table public.pull_request_audits (
  id                      uuid primary key default gen_random_uuid(),
  repository_id           uuid not null references public.repositories(id) on delete cascade,
  pr_number               integer not null,
  pr_title                text not null,
  pr_author               text not null,
  head_sha                text not null,
  base_sha                text not null,
  findings                jsonb not null default '[]'::jsonb,
  total_debt_minutes      integer not null default 0,
  security_score          integer not null default 100 check (security_score between 0 and 100),
  maintainability_score   integer not null default 100 check (maintainability_score between 0 and 100),
  github_comment_ids      integer[] not null default '{}',
  ai_provider             text not null,
  ai_model                text not null,
  processing_ms           integer not null default 0,
  created_at              timestamptz not null default now()
);

alter table public.pull_request_audits enable row level security;

create index idx_audits_repository_id on public.pull_request_audits(repository_id);
create index idx_audits_created_at on public.pull_request_audits(created_at desc);

-- ============================================================
-- MIGRATION JOBS
-- ============================================================
create type public.migration_status as enum ('pending', 'processing', 'completed', 'failed');
create type public.source_language as enum ('javascript', 'python', 'php');

create table public.migration_jobs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  status           public.migration_status not null default 'pending',
  source_language  public.source_language not null,
  files            jsonb not null default '[]'::jsonb,
  total_files      integer not null default 0,
  processed_files  integer not null default 0,
  ai_provider      text not null,
  ai_model         text not null,
  error_message    text,
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.migration_jobs enable row level security;

create index idx_migration_jobs_org_id on public.migration_jobs(organization_id);

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Helper: check org membership
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
  );
$$;

-- Organizations: members can read; owners can modify
create policy "org_members_can_read"
  on public.organizations for select
  using (public.is_org_member(id));

create policy "org_members_create"
  on public.organizations for insert
  with check (true);

create policy "org_owners_update"
  on public.organizations for update
  using (
    exists (
      select 1 from public.organization_members
      where organization_id = id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Organization members
create policy "members_can_read_own"
  on public.organization_members for select
  using (public.is_org_member(organization_id));

create policy "members_insert_self"
  on public.organization_members for insert
  with check (user_id = auth.uid());

-- Repositories
create policy "repo_members_can_read"
  on public.repositories for select
  using (public.is_org_member(organization_id));

create policy "repo_admins_can_write"
  on public.repositories for insert
  with check (public.is_org_member(organization_id));

create policy "repo_admins_can_update"
  on public.repositories for update
  using (public.is_org_member(organization_id));

create policy "repo_admins_can_delete"
  on public.repositories for delete
  using (
    exists (
      select 1 from public.organization_members
      where organization_id = repositories.organization_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- API Keys: never expose encrypted_key to client
create policy "apikey_members_read"
  on public.api_keys for select
  using (public.is_org_member(organization_id));

create policy "apikey_admins_write"
  on public.api_keys for insert
  with check (public.is_org_member(organization_id));

create policy "apikey_admins_update"
  on public.api_keys for update
  using (public.is_org_member(organization_id));

create policy "apikey_admins_delete"
  on public.api_keys for delete
  using (
    exists (
      select 1 from public.organization_members
      where organization_id = api_keys.organization_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Audits: org members can read
create policy "audit_members_read"
  on public.pull_request_audits for select
  using (
    exists (
      select 1 from public.repositories r
      where r.id = pull_request_audits.repository_id
        and public.is_org_member(r.organization_id)
    )
  );

-- Service role inserts (from webhook handler)
create policy "audit_service_insert"
  on public.pull_request_audits for insert
  with check (true);

-- Migration jobs
create policy "migration_members_read"
  on public.migration_jobs for select
  using (public.is_org_member(organization_id));

create policy "migration_members_create"
  on public.migration_jobs for insert
  with check (public.is_org_member(organization_id));

create policy "migration_service_update"
  on public.migration_jobs for update
  using (public.is_org_member(organization_id));

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger trg_repositories_updated_at
  before update on public.repositories
  for each row execute function public.set_updated_at();

create trigger trg_api_keys_updated_at
  before update on public.api_keys
  for each row execute function public.set_updated_at();
