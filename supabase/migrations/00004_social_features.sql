-- =============================================================================
-- CineMind — social features: spoiler flags, like/report counters, optional
-- category ratings, and per-user profile statistics.
-- -----------------------------------------------------------------------------
-- 25 tables total (24 from 00001/00003 + movie_rating_categories).
--
-- Design contract (same as 00001):
--   * Idempotent: safe to apply over an already-applied DB and to replay from
--     scratch (`supabase db reset`).
--   * RLS enabled on every table; users modify only their own rows.
-- =============================================================================

begin;

-- ── reviews: spoiler flag + denormalized like/report counters ───────────────
alter table public.reviews
  add column if not exists has_spoilers boolean not null default false,
  add column if not exists likes_count int not null default 0 check (likes_count >= 0);

-- Column-scoped grant fix: the blanket `grant update on public.reviews to
-- authenticated` in 00001 would let any owner overwrite likes_count/
-- report_count directly via PostgREST. Restrict the client-writable columns
-- and let only the trigger functions below (security definer) touch the
-- counters. RLS still separates owner vs admin on `status`.
revoke update on public.reviews from authenticated;
grant update (title, body, rating, language_code, status, has_spoilers)
  on public.reviews to authenticated;

create or replace function public.review_likes_count_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.reviews set likes_count = likes_count + 1 where id = new.review_id;
  elsif tg_op = 'DELETE' then
    update public.reviews set likes_count = likes_count - 1 where id = old.review_id;
  end if;
  return null;
end;
$$;

drop trigger if exists review_likes_sync_count on public.review_likes;
create trigger review_likes_sync_count
  after insert or delete on public.review_likes
  for each row execute function public.review_likes_count_sync();

-- report_count is incremented on report creation only; reports are never
-- deleted, only status-transitioned (open -> resolved/dismissed), so no
-- decrement case is needed.
create or replace function public.review_reports_count_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reviews set report_count = report_count + 1 where id = new.review_id;
  return null;
end;
$$;

drop trigger if exists review_reports_sync_count on public.review_reports;
create trigger review_reports_sync_count
  after insert on public.review_reports
  for each row execute function public.review_reports_count_sync();

-- Backfill both counters from rows that already existed before these triggers
-- were created (e.g. seed data from 00002, or any live data when this
-- migration is applied to an existing deployment). Without this, pre-existing
-- likes/reports stay permanently uncounted. Idempotent: re-running is a no-op
-- once the counters already agree with the source tables.
update public.reviews r
set likes_count = c.n
from (
  select r2.id, coalesce((select count(*) from public.review_likes rl where rl.review_id = r2.id), 0)::int n
  from public.reviews r2
) c
where c.id = r.id and r.likes_count is distinct from c.n;

update public.reviews r
set report_count = c.n
from (
  select r2.id, coalesce((select count(*) from public.review_reports rr where rr.review_id = r2.id), 0)::int n
  from public.reviews r2
) c
where c.id = r.id and r.report_count is distinct from c.n;

create index if not exists reviews_movie_created_idx
  on public.reviews (movie_id, status, created_at desc);
create index if not exists reviews_movie_likes_idx
  on public.reviews (movie_id, status, likes_count desc, created_at desc);

-- ── movie_rating_categories (optional sub-scores on a user's rating) ────────
create table if not exists public.movie_rating_categories (
  id uuid primary key default gen_random_uuid(),
  movie_rating_id uuid not null references public.movie_ratings (id) on delete cascade,
  category text not null check (category in ('acting', 'story', 'visuals', 'sound', 'pacing')),
  score smallint not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (movie_rating_id, category)
);

alter table public.movie_rating_categories enable row level security;

drop policy if exists "movie_rating_categories_read_public" on public.movie_rating_categories;
create policy "movie_rating_categories_read_public" on public.movie_rating_categories
  for select using (true);

drop policy if exists "movie_rating_categories_owner_write" on public.movie_rating_categories;
create policy "movie_rating_categories_owner_write" on public.movie_rating_categories
  for all
  using (
    exists (
      select 1 from public.movie_ratings mr
      where mr.id = movie_rating_id and mr.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.movie_ratings mr
      where mr.id = movie_rating_id and mr.user_id = auth.uid()
    )
  );

drop trigger if exists movie_rating_categories_set_updated_at on public.movie_rating_categories;
create trigger movie_rating_categories_set_updated_at before update on public.movie_rating_categories
  for each row execute function public.set_updated_at();

create index if not exists movie_rating_categories_rating_idx
  on public.movie_rating_categories (movie_rating_id);

grant select on public.movie_rating_categories to anon, authenticated;
grant insert, update, delete on public.movie_rating_categories to authenticated;

-- ── profile statistics ───────────────────────────────────────────────────────
-- A SQL function (not a view) so it can never be pointed at another user's
-- data by accident — a plain view executes with the view owner's privileges
-- unless explicitly declared security_invoker, which would silently bypass
-- RLS on the underlying tables.
--
-- IMPORTANT: this takes an explicit p_user_id rather than reading auth.uid(),
-- because every backend store in this codebase calls Postgres through the
-- service-role admin client (see services/supabase.ts), never a per-request
-- client scoped to the caller's own JWT. Under the service-role client,
-- auth.uid() is null, so an auth.uid()-based function would silently return
-- empty stats for everyone. Safety instead comes from the grant below:
-- EXECUTE is revoked from PUBLIC/anon/authenticated and granted only to
-- service_role, so only our trusted backend — which always passes the
-- request's own verified req.auth.userId, never client-supplied input — can
-- call this at all. It is security definer purely to read across tables
-- consistently in one statement, not to bypass an auth check.
create or replace function public.get_profile_stats(p_user_id uuid)
returns table (
  reviews_count int,
  avg_rating_given numeric,
  watchlist_count int,
  favorites_count int,
  watched_count int,
  likes_received int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.reviews where user_id = p_user_id and status <> 'deleted'),
    (select round(avg(score), 2) from public.movie_ratings where user_id = p_user_id),
    (select count(*)::int from public.watchlists where user_id = p_user_id),
    (select count(*)::int from public.favorites where user_id = p_user_id),
    (select count(*)::int from public.watch_history where user_id = p_user_id and status = 'finished'),
    (select coalesce(sum(r.likes_count), 0)::int from public.reviews r where r.user_id = p_user_id);
$$;

-- NOTE: `revoke ... from public` alone is NOT enough on Supabase. Supabase
-- ships `alter default privileges` rules that explicitly grant EXECUTE on new
-- public-schema functions to anon and authenticated, and those explicit grants
-- survive a revoke aimed at the PUBLIC pseudo-role. Verified against a live
-- project: without the revoke below, any logged-in user (or anon) could call
-- get_profile_stats('<someone-elses-uuid>') straight through PostgREST and read
-- another user's statistics, because this function is security definer and
-- takes the subject as a parameter.
revoke execute on function public.get_profile_stats(uuid) from public;
revoke execute on function public.get_profile_stats(uuid) from anon, authenticated;
grant execute on function public.get_profile_stats(uuid) to service_role;

commit;
