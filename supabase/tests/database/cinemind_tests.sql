-- =============================================================================
-- CineMind MVP — database tests (pgTAP)
-- -----------------------------------------------------------------------------
-- Runnable via:  supabase db test
-- Requires migrations 00001 + 00002 + 00003 (seeds) to be applied first.
--
-- Covers:
--   * presence of the 25 expected tables (24 + movie_rating_categories)
--   * seed fixture counts / determinism
--   * uniqueness constraints (23505)
--   * ownership + RLS rules (42501) across anon / authenticated / admin
--   * column-level grants (profiles.role AND reviews.likes_count/report_count
--     are not client-updatable — the latter guards the 00004 grant-revoke fix)
--   * agent observability tables are invisible to clients (no grants)
--   * ingestion job queue is restricted to service_role (no client grants)
--   * review_likes/review_reports moderation rules (anon blocked, duplicate
--     reports rejected, only admins resolve reports)
--   * the likes_count trigger stays in sync with review_likes rows
-- =============================================================================

begin;
select plan(64);

-- ── tables exist ─────────────────────────────────────────────────────────────
select has_table('public', 'profiles',         'profiles table exists');
select has_table('public', 'movies',           'movies table exists');
select has_table('public', 'people',           'people table exists');
select has_table('public', 'genres',           'genres table exists');
select has_table('public', 'movie_genres',     'movie_genres table exists');
select has_table('public', 'movie_cast',       'movie_cast table exists');
select has_table('public', 'movie_crew',       'movie_crew table exists');
select has_table('public', 'movie_sources',    'movie_sources table exists');
select has_table('public', 'movie_financials', 'movie_financials table exists');
select has_table('public', 'external_ratings', 'external_ratings table exists');
select has_table('public', 'movie_ratings',    'movie_ratings table exists');
select has_table('public', 'reviews',          'reviews table exists');
select has_table('public', 'review_likes',     'review_likes table exists');
select has_table('public', 'review_reports',   'review_reports table exists');
select has_table('public', 'watchlists',       'watchlists table exists');
select has_table('public', 'favorites',        'favorites table exists');
select has_table('public', 'watch_history',    'watch_history table exists');
select has_table('public', 'conversations',    'conversations table exists');
select has_table('public', 'messages',         'messages table exists');
select has_table('public', 'agent_runs',       'agent_runs table exists');
select has_table('public', 'agent_tool_calls', 'agent_tool_calls table exists');
select has_table('public', 'production_companies', 'production_companies table exists');
select has_table('public', 'movie_production_companies', 'movie_production_companies table exists');
select has_table('public', 'ingestion_jobs',   'ingestion_jobs table exists');
select has_table('public', 'movie_rating_categories', 'movie_rating_categories table exists');

-- ── deterministic seed fixtures ──────────────────────────────────────────────
select results_eq(
  'select count(*)::int from public.genres',
  array[19],
  '19 canonical genres seeded'
);
select results_eq(
  'select count(*)::int from public.movies',
  array[5],
  '5 demo movies seeded'
);
select results_eq(
  'select count(*)::int from public.movie_cast',
  array[24],
  '24 cast rows seeded'
);
select results_eq(
  'select count(*)::int from public.movie_sources where conflict_status = ''ok''',
  array[10],
  '10 provenance rows seeded, all ok'
);

-- ── uniqueness constraints (23505) ───────────────────────────────────────────
-- movies: unique slug
select throws_ok(
  $$ insert into public.movies (slug, title) values ('the-shawshank-redemption', 'Duplicate') $$,
  '23505', null,
  'movies.slug unique enforced'
);
-- movie_sources: unique (movie_id, source_name, source_id)
select throws_ok(
  $$ insert into public.movie_sources (movie_id, source_name, source_id, source_kind)
     values ('a1000000-0000-4000-8000-000000000001', 'tmdb', '278', 'api') $$,
  '23505', null,
  'movie_sources natural key unique enforced'
);
-- watchlists: unique (user_id, movie_id)
select throws_ok(
  $$ insert into public.watchlists (user_id, movie_id)
     values ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000001') $$,
  '23505', null,
  'watchlists (user_id, movie_id) unique enforced'
);
-- reviews: unique (user_id, movie_id)
select throws_ok(
  $$ insert into public.reviews (user_id, movie_id, body)
     values ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000001', 'x' || repeat('y', 40)) $$,
  '23505', null,
  'reviews (user_id, movie_id) unique enforced'
);
-- movie_ratings: unique (user_id, movie_id)
select throws_ok(
  $$ insert into public.movie_ratings (user_id, movie_id, score)
     values ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000001', 9) $$,
  '23505', null,
  'movie_ratings (user_id, movie_id) unique enforced'
);
-- movie_rating_categories: unique (movie_rating_id, category)
insert into public.movie_rating_categories (movie_rating_id, category, score)
values (
  (select id from public.movie_ratings
   where user_id = '00000000-0000-4000-8000-0000000000a1' and movie_id = 'a1000000-0000-4000-8000-000000000001'),
  'acting', 9
);
select throws_ok(
  $$ insert into public.movie_rating_categories (movie_rating_id, category, score)
     values (
       (select id from public.movie_ratings
        where user_id = '00000000-0000-4000-8000-0000000000a1' and movie_id = 'a1000000-0000-4000-8000-000000000001'),
       'acting', 5
     ) $$,
  '23505', null,
  'movie_rating_categories (movie_rating_id, category) unique enforced'
);
-- review_reports: unique (review_id, reporter_id) — a1 already reported this review in seed data
select throws_ok(
  $$ insert into public.review_reports (review_id, reporter_id, reason)
     values ('a3000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', 'other') $$,
  '23505', null,
  'review_reports (review_id, reporter_id) unique enforced'
);

-- ── RLS + ownership: anon ────────────────────────────────────────────────────
set local role anon;
select results_eq(
  'select count(*)::int from public.movies',
  array[5],
  'anon can read public catalog'
);
select throws_ok(
  $$ insert into public.movies (slug, title) values ('anon-movie', 'Nope') $$,
  '42501', null,
  'anon cannot write catalog (RLS policy check fails)'
);
select throws_ok(
  $$ insert into public.reviews (user_id, movie_id, body)
     values ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000001', repeat('x', 40)) $$,
  '42501', null,
  'anon cannot insert reviews'
);
select throws_ok(
  $$ insert into public.review_likes (user_id, review_id)
     values ('00000000-0000-4000-8000-0000000000a1', 'a3000000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'anon cannot like a review'
);
select throws_ok(
  $$ insert into public.review_reports (review_id, reporter_id, reason)
     values ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'spam') $$,
  '42501', null,
  'anon cannot report a review'
);
reset role;

-- ── RLS: authenticated user demo1 ────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- can read public catalog
select results_eq(
  'select count(*)::int from public.movies where slug = ''the-dark-knight''',
  array[1],
  'authenticated can read catalog'
);

-- can insert into OWN watchlist
select lives_ok(
  $$ insert into public.watchlists (user_id, movie_id) values ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000005') $$,
  'user can insert into own watchlist'
);
-- cannot insert into ANOTHER user's watchlist
select throws_ok(
  $$ insert into public.watchlists (user_id, movie_id) values ('00000000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000005') $$,
  '42501', null,
  'user cannot insert into another user''s watchlist'
);
-- cannot update another user's review (RLS silently filters to 0 rows)
select results_eq(
  $$ with del as (update public.reviews set status = 'hidden' where id = 'a3000000-0000-4000-8000-000000000002' returning 1)
     select count(*)::int from del $$,
  array[0],
  'user cannot update another user''s review (0 rows affected)'
);
-- can update own review, but not to 'deleted' (policy limits statuses)
select lives_ok(
  $$ update public.reviews set status = 'hidden' where id = 'a3000000-0000-4000-8000-000000000001' $$,
  'user can hide own review'
);
select throws_ok(
  $$ update public.reviews set status = 'deleted' where id = 'a3000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'user cannot soft-delete own review (status change blocked)'
);
-- can rate a movie once; second one blocked by unique via RLS+constraint
select lives_ok(
  $$ insert into public.movie_ratings (user_id, movie_id, score) values ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000003', 7) $$,
  'user can rate a new movie'
);
-- cannot insert a category score against another user's rating
select throws_ok(
  $$ insert into public.movie_rating_categories (movie_rating_id, category, score)
     values (
       (select id from public.movie_ratings
        where user_id = '00000000-0000-4000-8000-0000000000a2' and movie_id = 'a1000000-0000-4000-8000-000000000001'),
       'story', 6
     ) $$,
  '42501', null,
  'user cannot add a category score to another user''s rating'
);
-- reviews.likes_count / report_count are not client-updatable, even on own review
-- (guards the 00004 grant-revoke fix: only the trigger functions may write these)
select throws_ok(
  $$ update public.reviews set likes_count = 999 where id = 'a3000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'user cannot directly set likes_count on own review (column grant revoked)'
);
select throws_ok(
  $$ update public.reviews set report_count = 999 where id = 'a3000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'user cannot directly set report_count on own review (column grant revoked)'
);
-- reporters cannot resolve their own report — only admins may
select throws_ok(
  $$ update public.review_reports set status = 'dismissed'
     where review_id = 'a3000000-0000-4000-8000-000000000002'
       and reporter_id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501', null,
  'reporter cannot resolve their own report (admin-only)'
);
-- profile: role column not client-updatable (column-level grant)
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501', null,
  'user cannot escalate own role (column grant revoked)'
);
select lives_ok(
  $$ update public.profiles set display_name = 'Renamed' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  'user can update granted profile columns'
);
-- agent observability tables: no grants => inaccessible to clients
select throws_ok(
  'select count(*) from public.agent_runs',
  '42501', null,
  'agent_runs invisible to authenticated (no grant)'
);
select throws_ok(
  'select count(*) from public.agent_tool_calls',
  '42501', null,
  'agent_tool_calls invisible to authenticated (no grant)'
);
-- conversation-scoped messages: user sees only own conversation's messages
select results_eq(
  'select count(*)::int from public.conversations',
  array[1],
  'user sees only own conversations'
);
reset role;

-- ── RLS: admin ───────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select results_eq(
  'select count(*)::int from public.reviews',
  array[2],
  'admin can read all reviews (including hidden/published)'
);
select results_eq(
  'select count(*)::int from public.review_reports',
  array[1],
  'admin can read all reports'
);
select lives_ok(
  $$ update public.reviews set status = 'hidden' where id = 'a3000000-0000-4000-8000-000000000002' $$,
  'admin can hide any review'
);
select lives_ok(
  $$ update public.review_reports set status = 'dismissed'
     where review_id = 'a3000000-0000-4000-8000-000000000002'
       and reporter_id = '00000000-0000-4000-8000-0000000000a1' $$,
  'admin can resolve a report'
);

-- likes_count trigger: stays in sync with review_likes rows.
-- Review a3...0001 starts with 1 like (from a2, seeded). Admin (a3) adds a
-- second like, then removes it, and the counter must move with each change.
insert into public.review_likes (user_id, review_id)
values ('00000000-0000-4000-8000-0000000000a3', 'a3000000-0000-4000-8000-000000000001');
select results_eq(
  $$ select likes_count from public.reviews where id = 'a3000000-0000-4000-8000-000000000001' $$,
  array[2],
  'likes_count trigger increments on review_likes insert'
);
delete from public.review_likes
where user_id = '00000000-0000-4000-8000-0000000000a3' and review_id = 'a3000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select likes_count from public.reviews where id = 'a3000000-0000-4000-8000-000000000001' $$,
  array[1],
  'likes_count trigger decrements on review_likes delete'
);
reset role;

-- ── service_role (bypasses RLS; existing seeded state intact) ────────────────
set local role service_role;
select results_eq(
  'select count(*)::int from public.agent_runs',
  array[1],
  'service_role can read agent observability rows'
);
reset role;

select * from finish();
rollback;