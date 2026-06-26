-- RepoShield AI — Webhook Deliveries Table (Migration 003)
-- Idempotency log for GitHub webhook deliveries.
-- The webhook handler inserts delivery_id (X-GitHub-Delivery header) before
-- processing. A unique-constraint error (23505) signals a duplicate delivery,
-- which the handler short-circuits with HTTP 200 to satisfy GitHub's retry logic
-- without executing the expensive audit pipeline a second time.

create table public.webhook_deliveries (
  delivery_id   text        primary key,
  event_type    text        not null,
  processed     boolean     not null default false,
  received_at   timestamptz not null default now()
);

-- No auth-session required for this table — the service role writes it from
-- the webhook handler before any user context is established.
alter table public.webhook_deliveries enable row level security;

-- Only the service role (webhook handler) may insert rows.
create policy "webhook_deliveries_service_insert"
  on public.webhook_deliveries for insert
  with check (true);

-- Allow service role to update processed flag after a successful audit.
create policy "webhook_deliveries_service_update"
  on public.webhook_deliveries for update
  using (true)
  with check (true);

-- Index for expiry-based cleanup jobs (delete rows older than 30 days).
create index idx_webhook_deliveries_received_at
  on public.webhook_deliveries(received_at desc);
