-- RepoShield AI — Sprint 2: GitHub App Installation Lifecycle Tracking

create type public.installation_status as enum ('active', 'suspended', 'deleted');

create table public.github_app_installations (
  id              bigint primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  account_login   text not null,
  account_type    text not null check (account_type in ('User', 'Organization')),
  status          public.installation_status not null default 'active',
  installed_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.github_app_installations enable row level security;

-- Members of a linked org can see the installation record.
-- Installations not yet linked (organization_id IS NULL) are invisible to users.
create policy "installation_members_read"
  on public.github_app_installations for select
  using (
    organization_id is not null
    and public.is_org_member(organization_id)
  );

-- Webhook handler and callback both run as service role — bypass RLS.
create policy "installation_service_insert"
  on public.github_app_installations for insert
  with check (true);

create policy "installation_service_update"
  on public.github_app_installations for update
  using (true);

create index idx_installations_org_id
  on public.github_app_installations(organization_id)
  where organization_id is not null;

create trigger trg_github_app_installations_updated_at
  before update on public.github_app_installations
  for each row execute function public.set_updated_at();
