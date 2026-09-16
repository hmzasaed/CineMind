-- =============================================================================
-- CineMind MVP — normalized schema
-- -----------------------------------------------------------------------------
-- 21 tables: profiles, movies, people, genres, movie_genres, movie_cast,
-- movie_crew, movie_sources, movie_financials, external_ratings, movie_ratings,
-- reviews, review_likes, review_reports, watchlists, favorites, watch_history,
-- conversations, messages, agent_runs, agent_tool_calls.
--
-- Design contract:
--   * Normalized (no array-of-genres; joins only). No vector columns, no
--     embedding tables, no vector extensions (pgvector / pg_trgm excluded).
--   * Every fact-carrying table carries provenance: provider, provider_id,
--     retrieved_at, confidence. Conflict semantics live on movie_sources.
--   * RLS enabled on every table. Public can READ the catalog + published
--     reviews. Users modify ONLY their own rows. Admin rows (reports,
--     agent_runs, agent_tool_calls, conversations) are restricted.
--   * Migration is idempotent: safe to apply over an already-applied DB and
--     to replay from scratch (`supabase db reset`).
-- =============================================================================

begin;

-- ── extensions (no vector extensions by design) ──────────────────────────────
create extension if not exists pgcrypto;

-- ── schema helpers ───────────────────────────────────────────────────────────
-- Guarded enum creation (CREATE TYPE has no IF NOT EXISTS until PG17).
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'source_kind'
  ) then
    create type public.source_kind as enum (
      'database', 'api', 'user_data', 'ml_model', 'web_research', 'static', 'deterministic'
    );
  end if;
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'message_role'
  ) then
    create type public.message_role as enum ('system', 'user', 'assistant', 'tool');
  end if;
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'agent_run_status'
  ) then
    create type public.agent_run_status as enum ('running', 'succeeded', 'failed');
  end if;
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'tool_call_status'
  ) then
    create type public.tool_call_status as enum ('succeeded', 'failed');
  end if;
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'report_status'
  ) then
    create type public.report_status as enum ('open', 'resolved', 'dismissed');
  end if;
end $$;

-- updated_at maintenance (created early, used by profiles and other tables).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── profiles ─────────────────────────────────────────────────────────────────
-- Created before is_admin() so that function can reference it.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (length(username) between 3 and 32),
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_read_public" on public.profiles;
create policy "profiles_read_public" on public.profiles
  for select using (true);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Admin detection helper. Security definer so policies can call it without
-- running admin checks under the caller's RLS context. Defined after profiles
-- (which it references), before relational policies that use it.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ── movies (canonical facts; client-write locked) ────────────────────────────
create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (length(title) between 1 and 500),
  original_title text,
  tagline text,
  overview text check (char_length(overview) <= 20000),
  release_year smallint check (release_year between 1888 and 2100),
  runtime_minutes smallint check (runtime_minutes is null or runtime_minutes > 0),
  content_rating text check (content_rating in ('G', 'PG', 'PG-13', 'R', 'NC-17', 'NR')),
  poster_url text check (poster_url is null or poster_url like 'https://%'),
  backdrop_url text check (backdrop_url is null or backdrop_url like 'https://%'),
  -- provenance (source of this fact record)
  provider text not null default 'manual',
  provider_id text not null default '',
  retrieved_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  data_version int not null default 1 check (data_version >= 1),
  -- external ids (imdb is a first-class column; the rest live in this object)
  imdb_id text,
  external_ids jsonb not null default '{}' check (jsonb_typeof(external_ids) = 'object'),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, provider_id)
);

alter table public.movies enable row level security;

drop policy if exists "movies_read_public" on public.movies;
create policy "movies_read_public" on public.movies
  for select using (true);
drop policy if exists "movies_no_client_writes" on public.movies;
create policy "movies_no_client_writes" on public.movies
  for insert with check (false);

drop trigger if exists movies_set_updated_at on public.movies;
create trigger movies_set_updated_at before update on public.movies
  for each row execute function public.set_updated_at();

create index if not exists movies_title_idx on public.movies (title);
create index if not exists movies_release_year_idx on public.movies (release_year);
create index if not exists movies_provider_idx on public.movies (provider, provider_id);
create index if not exists movies_imdb_idx on public.movies (imdb_id) where imdb_id is not null;

-- ── people ───────────────────────────────────────────────────────────────────
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  gender text check (gender in ('female', 'male', 'non_binary', 'unknown')),
  biography text check (biography is null or char_length(biography) <= 20000),
  birthday date,
  deathday date,
  place_of_birth text,
  profile_url text check (profile_url is null or profile_url like 'https://%'),
  known_for_department text,
  provider text not null default 'manual',
  provider_id text not null default '',
  retrieved_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  external_ids jsonb not null default '{}' check (jsonb_typeof(external_ids) = 'object'),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, provider_id),
  check (deathday is null or birthday is null or deathday >= birthday)
);

alter table public.people enable row level security;

drop policy if exists "people_read_public" on public.people;
create policy "people_read_public" on public.people
  for select using (true);
drop policy if exists "people_no_client_writes" on public.people;
create policy "people_no_client_writes" on public.people
  for insert with check (false);

drop trigger if exists people_set_updated_at on public.people;
create trigger people_set_updated_at before update on public.people
  for each row execute function public.set_updated_at();

create index if not exists people_name_idx on public.people (name);
create index if not exists people_provider_idx on public.people (provider, provider_id);

-- ── genres ───────────────────────────────────────────────────────────────────
create table if not exists public.genres (
  id smallint primary key,
  name text not null unique,
  slug text not null unique
);

alter table public.genres enable row level security;

drop policy if exists "genres_read_public" on public.genres;
create policy "genres_read_public" on public.genres
  for select using (true);
drop policy if exists "genres_no_client_writes" on public.genres;
create policy "genres_no_client_writes" on public.genres
  for insert with check (false);

-- ── movie_genres (normalized N:M) ────────────────────────────────────────────
create table if not exists public.movie_genres (
  movie_id uuid not null references public.movies (id) on delete cascade,
  genre_id smallint not null references public.genres (id) on delete cascade,
  primary key (movie_id, genre_id)
);

alter table public.movie_genres enable row level security;

drop policy if exists "movie_genres_read_public" on public.movie_genres;
create policy "movie_genres_read_public" on public.movie_genres
  for select using (true);
drop policy if exists "movie_genres_no_client_writes" on public.movie_genres;
create policy "movie_genres_no_client_writes" on public.movie_genres
  for insert with check (false);

create index if not exists movie_genres_genre_idx on public.movie_genres (genre_id);

-- ── movie_cast ───────────────────────────────────────────────────────────────
create table if not exists public.movie_cast (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  character text not null check (char_length(character) between 1 and 500),
  cast_order smallint not null default 0 check (cast_order >= 0),
  credit_id text,
  provider text not null default 'manual',
  provider_id text not null default '',
  retrieved_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  unique (credit_id),
  unique (movie_id, cast_order),
  unique (movie_id, person_id, character)
);

alter table public.movie_cast enable row level security;

drop policy if exists "movie_cast_read_public" on public.movie_cast;
create policy "movie_cast_read_public" on public.movie_cast
  for select using (true);
drop policy if exists "movie_cast_no_client_writes" on public.movie_cast;
create policy "movie_cast_no_client_writes" on public.movie_cast
  for insert with check (false);

create index if not exists movie_cast_movie_idx on public.movie_cast (movie_id);
create index if not exists movie_cast_person_idx on public.movie_cast (person_id);

-- ── movie_crew ───────────────────────────────────────────────────────────────
create table if not exists public.movie_crew (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  department text not null check (char_length(department) between 1 and 100),
  job text not null check (char_length(job) between 1 and 100),
  credit_id text,
  provider text not null default 'manual',
  provider_id text not null default '',
  retrieved_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  unique (credit_id),
  unique (movie_id, person_id, department, job)
);

alter table public.movie_crew enable row level security;

drop policy if exists "movie_crew_read_public" on public.movie_crew;
create policy "movie_crew_read_public" on public.movie_crew
  for select using (true);
drop policy if exists "movie_crew_no_client_writes" on public.movie_crew;
create policy "movie_crew_no_client_writes" on public.movie_crew
  for insert with check (false);

create index if not exists movie_crew_movie_idx on public.movie_crew (movie_id);
create index if not exists movie_crew_person_idx on public.movie_crew (person_id);

-- ── movie_sources (provenance + conflict ledger) ─────────────────────────────
create table if not exists public.movie_sources (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies (id) on delete cascade,
  source_kind public.source_kind not null,
  source_name text not null,           -- provider label, e.g. 'tmdb', 'static'
  source_id text not null,             -- id at the provider
  source_url text,
  fetched_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  conflict_status text not null default 'ok' check (conflict_status in ('ok', 'conflict', 'stale')),
  revision int not null default 1 check (revision >= 1),
  payload jsonb check (payload is null or jsonb_typeof(payload) = 'object'),
  unique (movie_id, source_name, source_id)
);

alter table public.movie_sources enable row level security;

drop policy if exists "movie_sources_read_public" on public.movie_sources;
create policy "movie_sources_read_public" on public.movie_sources
  for select using (true);
drop policy if exists "movie_sources_no_client_writes" on public.movie_sources;
create policy "movie_sources_no_client_writes" on public.movie_sources
  for insert with check (false);

create index if not exists movie_sources_movie_idx on public.movie_sources (movie_id) where source_kind <> 'user_data';

-- ── movie_financials ─────────────────────────────────────────────────────────
create table if not exists public.movie_financials (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies (id) on delete cascade,
  budget numeric(16,2) check (budget is null or budget >= 0),
  revenue numeric(16,2) check (revenue is null or revenue >= 0),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  provider text not null default 'manual',
  provider_id text not null default '',
  retrieved_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  unique (movie_id, provider, provider_id)
);

alter table public.movie_financials enable row level security;

drop policy if exists "movie_financials_read_public" on public.movie_financials;
create policy "movie_financials_read_public" on public.movie_financials
  for select using (true);
drop policy if exists "movie_financials_no_client_writes" on public.movie_financials;
create policy "movie_financials_no_client_writes" on public.movie_financials
  for insert with check (false);

create index if not exists movie_financials_movie_idx on public.movie_financials (movie_id);

-- ── external_ratings (critic/aggregate scores; NOT user ratings) ─────────────
create table if not exists public.external_ratings (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies (id) on delete cascade,
  rating_name text not null check (rating_name in ('imdb', 'rotten_tomatoes', 'metacritic', 'tmdb', 'letterboxd')),
  score numeric(5,2) not null check (score >= 0),
  score_type text not null check (score_type in ('percent', 'out_of_10', 'out_of_100', 'out_of_5', 'letter')),
  votes int not null default 0 check (votes >= 0),
  url text,
  provider text not null default 'manual',
  provider_id text not null default '',
  retrieved_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  unique (movie_id, rating_name, provider)
);

alter table public.external_ratings enable row level security;

drop policy if exists "external_ratings_read_public" on public.external_ratings;
create policy "external_ratings_read_public" on public.external_ratings
  for select using (true);
drop policy if exists "external_ratings_no_client_writes" on public.external_ratings;
create policy "external_ratings_no_client_writes" on public.external_ratings
  for insert with check (false);

create index if not exists external_ratings_movie_idx on public.external_ratings (movie_id);

-- ── movie_ratings (user ratings; 1 per user per movie) ───────────────────────
create table if not exists public.movie_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id uuid not null references public.movies (id) on delete cascade,
  score smallint not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, movie_id)
);

alter table public.movie_ratings enable row level security;

-- Public select so aggregate ratings can be computed (e.g. movie card scores).
drop policy if exists "movie_ratings_read_public" on public.movie_ratings;
create policy "movie_ratings_read_public" on public.movie_ratings
  for select using (true);
drop policy if exists "movie_ratings_owner_insert" on public.movie_ratings;
create policy "movie_ratings_owner_insert" on public.movie_ratings
  for insert with check (auth.uid() = user_id);
drop policy if exists "movie_ratings_owner_update" on public.movie_ratings;
create policy "movie_ratings_owner_update" on public.movie_ratings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "movie_ratings_owner_delete" on public.movie_ratings;
create policy "movie_ratings_owner_delete" on public.movie_ratings
  for delete using (auth.uid() = user_id);

drop trigger if exists movie_ratings_set_updated_at on public.movie_ratings;
create trigger movie_ratings_set_updated_at before update on public.movie_ratings
  for each row execute function public.set_updated_at();

create index if not exists movie_ratings_movie_idx on public.movie_ratings (movie_id);

-- ── reviews ──────────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id uuid not null references public.movies (id) on delete cascade,
  title text check (title is null or char_length(title) <= 200),
  body text not null check (char_length(body) between 20 and 20000),
  rating smallint check (rating is null or rating between 1 and 10),
  language_code char(2) not null default 'en' check (language_code ~ '^[a-z]{2}$'),
  status text not null default 'published' check (status in ('published', 'hidden', 'deleted')),
  report_count int not null default 0 check (report_count >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, movie_id)          -- one review per user per movie
);

alter table public.reviews enable row level security;

-- NOTE: two PostgreSQL RLS subtleties drive this policy shape:
--   (1) WITH CHECK is AND-combined across every policy matching UPDATE, so a
--       separate admin "FOR ALL" policy with its own WITH CHECK would block
--       ordinary owners. A single UPDATE policy (owner OR admin) is required.
--   (2) The NEW row of an UPDATE must also pass the table's SELECT policies,
--       so the select policy lets owners read their own rows in any status
--       (else hiding a review would be rejected).
drop policy if exists "reviews_read_public" on public.reviews;
create policy "reviews_read_public" on public.reviews
  for select using (status = 'published' or auth.uid() = user_id or public.is_admin());
drop policy if exists "reviews_admin_read" on public.reviews;
drop policy if exists "reviews_owner_insert" on public.reviews;
create policy "reviews_owner_insert" on public.reviews
  for insert with check (auth.uid() = user_id);
-- NOTE: PostgreSQL ANDs WITH CHECK across all UPDATE policies, so a single
-- UPDATE policy (owner OR admin) is required to keep moderation working.
-- Drop legacy policy names that may exist from a prior migration run.
drop policy if exists "reviews_owner_update" on public.reviews;
drop policy if exists "reviews_admin_all" on public.reviews;
drop policy if exists "reviews_update_owner_or_admin" on public.reviews;
create policy "reviews_update_owner_or_admin" on public.reviews
  for update using (auth.uid() = user_id or public.is_admin())
  with check ((auth.uid() = user_id and status in ('published', 'hidden')) or public.is_admin());
drop policy if exists "reviews_owner_delete" on public.reviews;
create policy "reviews_owner_delete" on public.reviews
  for delete using (auth.uid() = user_id);
drop policy if exists "reviews_admin_delete" on public.reviews;
create policy "reviews_admin_delete" on public.reviews
  for delete using (public.is_admin());

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

create index if not exists reviews_movie_idx on public.reviews (movie_id, status);
create index if not exists reviews_user_idx on public.reviews (user_id);

-- ── review_likes ─────────────────────────────────────────────────────────────
create table if not exists public.review_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  review_id uuid not null references public.reviews (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, review_id)
);

alter table public.review_likes enable row level security;

drop policy if exists "review_likes_read_public" on public.review_likes;
create policy "review_likes_read_public" on public.review_likes
  for select using (true);           -- counts are public
drop policy if exists "review_likes_owner_insert" on public.review_likes;
create policy "review_likes_owner_insert" on public.review_likes
  for insert with check (auth.uid() = user_id);
drop policy if exists "review_likes_owner_delete" on public.review_likes;
create policy "review_likes_owner_delete" on public.review_likes
  for delete using (auth.uid() = user_id);

create index if not exists review_likes_review_idx on public.review_likes (review_id);

-- ── review_reports (moderation; admin-managed) ───────────────────────────────
create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'incorrect', 'spoilers', 'other')),
  details text check (details is null or char_length(details) <= 2000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id, reporter_id)    -- one report per reporter per review
);

alter table public.review_reports enable row level security;

-- Reporters may read the status of their own reports; admins see everything.
drop policy if exists "review_reports_reporter_select" on public.review_reports;
create policy "review_reports_reporter_select" on public.review_reports
  for select using (reporter_id = auth.uid() or public.is_admin());
drop policy if exists "review_reports_reporter_insert" on public.review_reports;
create policy "review_reports_reporter_insert" on public.review_reports
  for insert with check (reporter_id = auth.uid());
drop policy if exists "review_reports_admin_update" on public.review_reports;
create policy "review_reports_admin_update" on public.review_reports
  for update using (public.is_admin()) with check (public.is_admin());

drop trigger if exists review_reports_set_updated_at on public.review_reports;
create trigger review_reports_set_updated_at before update on public.review_reports
  for each row execute function public.set_updated_at();

create index if not exists review_reports_review_idx on public.review_reports (review_id);
create index if not exists review_reports_status_idx on public.review_reports (status);

-- ── watchlists ───────────────────────────────────────────────────────────────
create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id uuid not null references public.movies (id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  added_at timestamptz not null default now(),
  unique (user_id, movie_id)
);

alter table public.watchlists enable row level security;

drop policy if exists "watchlists_owner_all" on public.watchlists;
create policy "watchlists_owner_all" on public.watchlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists watchlists_user_idx on public.watchlists (user_id, added_at desc);

-- ── favorites ────────────────────────────────────────────────────────────────
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id uuid not null references public.movies (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, movie_id)
);

alter table public.favorites enable row level security;

drop policy if exists "favorites_owner_all" on public.favorites;
create policy "favorites_owner_all" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists favorites_user_idx on public.favorites (user_id, created_at desc);

-- ── watch_history ────────────────────────────────────────────────────────────
create table if not exists public.watch_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id uuid not null references public.movies (id) on delete cascade,
  status text not null default 'finished'
    check (status in ('planned', 'watching', 'paused', 'finished', 'abandoned')),
  progress_seconds int not null default 0 check (progress_seconds >= 0),
  watched_at timestamptz not null default now(),
  unique (user_id, movie_id, watched_at)
);

alter table public.watch_history enable row level security;

drop policy if exists "watch_history_owner_all" on public.watch_history;
create policy "watch_history_owner_all" on public.watch_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists watch_history_user_idx on public.watch_history (user_id, watched_at desc);

-- ── conversations (user-owned; AI chat) ──────────────────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text check (title is null or char_length(title) <= 200),
  provider text not null default 'rule-based',
  model text not null default 'offline',
  status text not null default 'active' check (status in ('active', 'archived')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

drop policy if exists "conversations_owner_all" on public.conversations;
create policy "conversations_owner_all" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "conversations_admin_read" on public.conversations;
create policy "conversations_admin_read" on public.conversations
  for select using (public.is_admin());

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create index if not exists conversations_user_idx on public.conversations (user_id, created_at desc);

-- ── messages ─────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role public.message_role not null,
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

-- Access is inherited from the owning conversation (participant-only).
drop policy if exists "messages_participant_all" on public.messages;
create policy "messages_participant_all" on public.messages
  for all using (
    exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

-- ── agent_runs (observability; service-role only, no client access) ──────────
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  provider text not null,
  model text not null default 'offline',
  status public.agent_run_status not null default 'running',
  started_at timestamptz not null default now(),
  duration_ms int check (duration_ms is null or duration_ms >= 0),
  error_code text,
  tools text[] not null default '{}',        -- tool names only, no arguments
  facts_cited int not null default 0 check (facts_cited >= 0),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  created_at timestamptz not null default now()
);

alter table public.agent_runs enable row level security;
-- No policies: RLS + no grants ⇒ zero client access; service_role writes only.

create index if not exists agent_runs_created_idx on public.agent_runs (created_at desc);
create index if not exists agent_runs_user_idx on public.agent_runs (user_id);

-- ── agent_tool_calls (bounded operational trace; service-role only) ─────────
create table if not exists public.agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  tool_name text not null,
  arguments jsonb check (arguments is null or jsonb_typeof(arguments) = 'object'),
  result_summary jsonb check (result_summary is null or jsonb_typeof(result_summary) = 'object'),
  status public.tool_call_status not null default 'succeeded',
  duration_ms int not null default 0 check (duration_ms >= 0),
  error_code text,
  created_at timestamptz not null default now()
);

alter table public.agent_tool_calls enable row level security;
-- No policies: service-role only, like agent_runs.

create index if not exists agent_tool_calls_run_idx on public.agent_tool_calls (run_id, created_at);

-- ── grants ──────────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated, service_role;

-- Catalog + published social content: everyone can read.
grant select on public.genres, public.movies, public.people, public.movie_genres,
  public.movie_cast, public.movie_crew, public.movie_sources, public.movie_financials,
  public.external_ratings, public.movie_ratings, public.reviews, public.review_likes,
  public.profiles to anon, authenticated;

-- User-modifiable tables: authenticated can write their own rows (RLS scopes it).
grant insert, update, delete on public.movie_ratings, public.reviews, public.review_likes,
  public.watchlists, public.favorites, public.watch_history, public.conversations,
  public.messages to authenticated;

-- Review reports: reporters insert + read own; no updates for non-admins.
grant select, insert on public.review_reports to authenticated;

-- Profiles: users may read all and update only safe columns of their own row.
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url) on public.profiles to authenticated;

-- Administrative / observability tables: service role only (no client grants).
grant all on public.review_reports, public.agent_runs, public.agent_tool_calls to service_role;

-- ── comments ─────────────────────────────────────────────────────────────────
comment on table public.movies is
  'Canonical movie facts. Written only by server pipelines (service_role); content is read-only to clients.';
comment on table public.movie_sources is
  'Provenance + conflict ledger for movie facts. conflict_status/revision track update conflicts.';
comment on table public.agent_runs is
  'Bounded AI operational summaries: tool names, timings, errors, confidence. No prompts, no chain-of-thought.';
comment on table public.agent_tool_calls is
  'Bounded tool-call trace: tool name, bounded arguments/results, timing, error. Service-role only.';
comment on function public.is_admin() is
  'Returns true when the current user has role=admin on their profile.';
comment on column public.movies.data_version is
  'Optimistic-concurrency counter; bumped by writers on each accepted fact update.';

commit;