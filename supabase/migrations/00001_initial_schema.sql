-- CineMind initial schema.
-- RLS is enabled on every table; client access is narrowly scoped.
-- The movies table is written ONLY by server-side pipelines (service role),
-- never by clients. The ai_op_logs table is service-role-only and stores
-- concise operational summaries (no prompts, no chain-of-thought).

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (length(username) between 3 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_read_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── movies (structured facts, managed by server pipelines) ──────────────────
create table public.movies (
  id text primary key,                     -- canonical source id, e.g. "tmdb:603"
  title text not null check (length(title) between 1 and 500),
  original_title text,
  release_year smallint check (release_year between 1888 and 2100),
  runtime_minutes smallint check (runtime_minutes > 0),
  overview text,
  genres text[] not null default '{}',
  rating_average numeric(3,1) check (rating_average between 0 and 10),
  rating_votes integer check (rating_votes >= 0),
  source text not null,                    -- provider name, e.g. "tmdb"
  source_ref text not null,                -- id at the provider
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  fetched_at timestamptz not null default now(),
  unique (source, source_ref)
);

alter table public.movies enable row level security;

-- Catalog reads are public (anonymous) but writes are server-only.
create policy "movies_read_public" on public.movies
  for select using (true);
create policy "movies_no_client_writes" on public.movies
  for insert with check (false);

create index movies_release_year_idx on public.movies (release_year);
create index movies_title_gin_idx on public.movies using gin (title gin_trgm_ops);

-- ── watchlist (user data) ────────────────────────────────────────────────────
create table public.watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id text not null references public.movies (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, movie_id)          -- DB-level duplicate guard → 409
);

alter table public.watchlist enable row level security;

create policy "watchlist_owner_select" on public.watchlist
  for select using (auth.uid() = user_id);
create policy "watchlist_owner_insert" on public.watchlist
  for insert with check (auth.uid() = user_id);
create policy "watchlist_owner_delete" on public.watchlist
  for delete using (auth.uid() = user_id);

-- ── ai_op_logs (observability, service-role only) ───────────────────────────
-- Bounded operational summaries: tool names, timings, error codes, confidence.
-- No prompts, no messages, no chain-of-thought, no full facts.
create table public.ai_op_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  provider text not null,
  tools jsonb not null default '[]',
  duration_ms integer not null check (duration_ms >= 0),
  error_code text,
  facts_cited integer not null default 0 check (facts_cited >= 0),
  confidence numeric(4,3) check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

alter table public.ai_op_logs enable row level security;
-- No policies: client access is denied entirely; only the service role writes.

create index ai_op_logs_created_at_idx on public.ai_op_logs (created_at desc);

commit;