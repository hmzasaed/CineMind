-- =============================================================================
-- CineMind — ingestion + production companies
-- -----------------------------------------------------------------------------
-- Adds three tables to the MVP schema:
--   * production_companies         canonical company facts (service-role writes)
--   * movie_production_companies   normalized N:M link to movies
--   * ingestion_jobs               database-backed job queue; the ingestion
--                                  worker claims rows here. Operators only.
--
-- Design contract (inherited from 00001):
--   * Provenance columns (provider, provider_id, retrieved_at, confidence) on
--     every fact-carrying table.
--   * RLS enabled on every table; catalog tables are public-read, client-write
--     locked. ingestion_jobs has NO client access at all (service-role only).
--   * Idempotent: safe to replay over an applied DB or from scratch.
-- =============================================================================

begin;

-- ── production_companies ─────────────────────────────────────────────────────
create table if not exists public.production_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  logo_url text check (logo_url is null or logo_url like 'https://%'),
  origin_country text check (origin_country is null or char_length(origin_country) between 2 and 2),
  provider text not null default 'manual',
  provider_id text not null default '',
  retrieved_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_id)
);

alter table public.production_companies enable row level security;

drop policy if exists "production_companies_read_public" on public.production_companies;
create policy "production_companies_read_public" on public.production_companies
  for select using (true);
drop policy if exists "production_companies_no_client_writes" on public.production_companies;
create policy "production_companies_no_client_writes" on public.production_companies
  for insert with check (false);

drop trigger if exists production_companies_set_updated_at on public.production_companies;
create trigger production_companies_set_updated_at before update on public.production_companies
  for each row execute function public.set_updated_at();

create index if not exists production_companies_provider_idx
  on public.production_companies (provider, provider_id);
create index if not exists production_companies_name_idx on public.production_companies (name);

-- ── movie_production_companies (normalized N:M) ──────────────────────────────
create table if not exists public.movie_production_companies (
  movie_id uuid not null references public.movies (id) on delete cascade,
  company_id uuid not null references public.production_companies (id) on delete cascade,
  primary key (movie_id, company_id)
);

alter table public.movie_production_companies enable row level security;

drop policy if exists "movie_production_companies_read_public" on public.movie_production_companies;
create policy "movie_production_companies_read_public" on public.movie_production_companies
  for select using (true);
drop policy if exists "movie_production_companies_no_client_writes" on public.movie_production_companies;
create policy "movie_production_companies_no_client_writes" on public.movie_production_companies
  for insert with check (false);

create index if not exists movie_production_companies_company_idx
  on public.movie_production_companies (company_id);

-- ── ingestion_jobs (operators + worker only; zero client access) ─────────────
create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('refresh_movie', 'refresh_upcoming')),
  provider text not null check (char_length(provider) between 1 and 64),
  external_id text not null check (char_length(external_id) between 1 and 128),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts int not null default 0 check (attempts >= 0),
  max_attempts int not null default 3 check (max_attempts between 1 and 10),
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  last_error text,
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ingestion_jobs enable row level security;
-- No policies: RLS + no grants ⇒ zero client access; worker/service_role only.

drop trigger if exists ingestion_jobs_set_updated_at on public.ingestion_jobs;
create trigger ingestion_jobs_set_updated_at before update on public.ingestion_jobs
  for each row execute function public.set_updated_at();

create index if not exists ingestion_jobs_next_idx
  on public.ingestion_jobs (status, scheduled_for) where status = 'pending';
create index if not exists ingestion_jobs_kind_idx on public.ingestion_jobs (kind);
create index if not exists ingestion_jobs_created_idx on public.ingestion_jobs (created_at desc);

-- ── grants ───────────────────────────────────────────────────────────────────
grant select on public.production_companies, public.movie_production_companies
  to anon, authenticated;
grant all on public.production_companies, public.movie_production_companies,
  public.ingestion_jobs to service_role;

-- ── comments ─────────────────────────────────────────────────────────────────
comment on table public.production_companies is
  'Canonical production company facts. Written only by server pipelines (service_role); read-only to clients.';
comment on table public.ingestion_jobs is
  'Database-backed ingestion queue. Claimed and processed by the ingestion worker; no client access.';
comment on table public.movie_production_companies is
  'N:M link between movies and production companies.';

commit;