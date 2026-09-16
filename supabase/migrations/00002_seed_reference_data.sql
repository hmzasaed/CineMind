-- =============================================================================
-- CineMind MVP — deterministic seed fixtures
-- -----------------------------------------------------------------------------
-- Replay-safe (every insert is ON CONFLICT DO NOTHING) and deterministic:
-- all primary keys are fixed literals, so identical fixtures appear on every
-- reset. Demo facts ship with source_kind 'static' (checked-in reference data).
--
-- Demo sign-ins (password is "password" for all three):
--   demo1@cinemind.example  (user)
--   demo2@cinemind.example  (user)
--   admin@cinemind.example  (admin)
-- =============================================================================

begin;

-- ── demo users (auth schema; bcrypt hash of "password") ─────────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user
)
values
  ('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'demo1@cinemind.example',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
   now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"name":"Demo One"}'::jsonb, false, false),
  ('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'demo2@cinemind.example',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
   now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"name":"Demo Two"}'::jsonb, false, false),
  ('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-0000000000a3',
   'authenticated', 'authenticated', 'admin@cinemind.example',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
   now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"name":"Admin"}'::jsonb, false, false)
on conflict (id) do nothing;

-- ── profiles ─────────────────────────────────────────────────────────────────
insert into public.profiles (id, username, display_name, role)
values
  ('00000000-0000-4000-8000-0000000000a1', 'demo1', 'Demo One', 'user'),
  ('00000000-0000-4000-8000-0000000000a2', 'demo2', 'Demo Two', 'user'),
  ('00000000-0000-4000-8000-0000000000a3', 'admin', 'The Admin', 'admin')
on conflict (id) do nothing;

-- ── genres (canonical catalog, ids 1-19) ────────────────────────────────────
insert into public.genres (id, name, slug)
values
  (1, 'Action', 'action'),
  (2, 'Adventure', 'adventure'),
  (3, 'Animation', 'animation'),
  (4, 'Comedy', 'comedy'),
  (5, 'Crime', 'crime'),
  (6, 'Documentary', 'documentary'),
  (7, 'Drama', 'drama'),
  (8, 'Family', 'family'),
  (9, 'Fantasy', 'fantasy'),
  (10, 'History', 'history'),
  (11, 'Horror', 'horror'),
  (12, 'Music', 'music'),
  (13, 'Mystery', 'mystery'),
  (14, 'Romance', 'romance'),
  (15, 'Science Fiction', 'science-fiction'),
  (16, 'TV Movie', 'tv-movie'),
  (17, 'Thriller', 'thriller'),
  (18, 'War', 'war'),
  (19, 'Western', 'western')
on conflict (id) do nothing;

-- ── people (normalized once; TMDB is the reference provider) ────────────────
insert into public.people (id, name, gender, known_for_department, provider, provider_id, confidence)
values
  ('a2000000-0000-4000-8000-000000000001', 'Tim Robbins', 'male', 'Acting', 'tmdb', '504', 1),
  ('a2000000-0000-4000-8000-000000000002', 'Morgan Freeman', 'male', 'Acting', 'tmdb', '192', 1),
  ('a2000000-0000-4000-8000-000000000003', 'Bob Gunton', 'male', 'Acting', 'tmdb', '1929', 1),
  ('a2000000-0000-4000-8000-000000000004', 'Frank Darabont', 'male', 'Directing', 'tmdb', '21219', 1),
  ('a2000000-0000-4000-8000-000000000005', 'Christian Bale', 'male', 'Acting', 'tmdb', '3894', 1),
  ('a2000000-0000-4000-8000-000000000006', 'Heath Ledger', 'male', 'Acting', 'tmdb', '1813', 1),
  ('a2000000-0000-4000-8000-000000000007', 'Aaron Eckhart', 'male', 'Acting', 'tmdb', '30082', 1),
  ('a2000000-0000-4000-8000-000000000008', 'Michael Caine', 'male', 'Acting', 'tmdb', '3895', 1),
  ('a2000000-0000-4000-8000-000000000009', 'Gary Oldman', 'male', 'Acting', 'tmdb', '273', 1),
  ('a2000000-0000-4000-8000-00000000000a', 'Christopher Nolan', 'male', 'Directing', 'tmdb', '525', 1),
  ('a2000000-0000-4000-8000-00000000000b', 'Leonardo DiCaprio', 'male', 'Acting', 'tmdb', '6193', 1),
  ('a2000000-0000-4000-8000-00000000000c', 'Joseph Gordon-Levitt', 'male', 'Acting', 'tmdb', '17922', 1),
  ('a2000000-0000-4000-8000-00000000000d', 'Elliot Page', 'non_binary', 'Acting', 'tmdb', '1403', 1),
  ('a2000000-0000-4000-8000-00000000000e', 'Marion Cotillard', 'female', 'Acting', 'tmdb', '142', 1),
  ('a2000000-0000-4000-8000-00000000000f', 'Ken Watanabe', 'male', 'Acting', 'tmdb', '524', 1),
  ('a2000000-0000-4000-8000-000000000010', 'Tom Hardy', 'male', 'Acting', 'tmdb', '2524', 1),
  ('a2000000-0000-4000-8000-000000000011', 'Quentin Tarantino', 'male', 'Directing', 'tmdb', '138', 1),
  ('a2000000-0000-4000-8000-000000000012', 'John Travolta', 'male', 'Acting', 'tmdb', '679', 1),
  ('a2000000-0000-4000-8000-000000000013', 'Samuel L. Jackson', 'male', 'Acting', 'tmdb', '2231', 1),
  ('a2000000-0000-4000-8000-000000000014', 'Uma Thurman', 'female', 'Acting', 'tmdb', '139', 1),
  ('a2000000-0000-4000-8000-000000000015', 'Bruce Willis', 'male', 'Acting', 'tmdb', '18897', 1),
  ('a2000000-0000-4000-8000-000000000016', 'Ving Rhames', 'male', 'Acting', 'tmdb', '7090', 1),
  ('a2000000-0000-4000-8000-000000000017', 'Francis Ford Coppola', 'male', 'Directing', 'tmdb', '1776', 1),
  ('a2000000-0000-4000-8000-000000000018', 'Marlon Brando', 'male', 'Acting', 'tmdb', '3084', 1),
  ('a2000000-0000-4000-8000-000000000019', 'Al Pacino', 'male', 'Acting', 'tmdb', '1158', 1),
  ('a2000000-0000-4000-8000-00000000001a', 'James Caan', 'male', 'Acting', 'tmdb', '1215', 1),
  ('a2000000-0000-4000-8000-00000000001b', 'Robert Duvall', 'male', 'Acting', 'tmdb', '1650', 1),
  ('a2000000-0000-4000-8000-00000000001c', 'Diane Keaton', 'female', 'Acting', 'tmdb', '2134', 1),
  ('a2000000-0000-4000-8000-00000000001d', 'Hans Zimmer', 'male', 'Sound', 'tmdb', '957', 1),
  ('a2000000-0000-4000-8000-00000000001e', 'Wally Pfister', 'male', 'Crew', 'tmdb', '872', 1)
on conflict (id) do nothing;

-- ── movies (canonical facts; static + tmdb provenance) ──────────────────────
insert into public.movies (
  id, slug, title, original_title, tagline, overview, release_year, runtime_minutes,
  content_rating, imdb_id, provider, provider_id, retrieved_at, confidence
)
values
  ('a1000000-0000-4000-8000-000000000001', 'the-shawshank-redemption',
   'The Shawshank Redemption', 'The Shawshank Redemption', 'Fear can hold you prisoner. Hope can set you free.',
   'Imprisoned in the 1940s for the double murder of his wife and her lover, upstanding banker Andy Dufresne begins a new life at the Shawshank prison.',
   1994, 142, 'R', 'tt0111161', 'static', 'tt0111161', now(), 1),
  ('a1000000-0000-4000-8000-000000000002', 'the-dark-knight',
   'The Dark Knight', 'The Dark Knight', 'Why so serious?',
   'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.',
   2008, 152, 'PG-13', 'tt0468569', 'static', 'tt0468569', now(), 1),
  ('a1000000-0000-4000-8000-000000000003', 'inception',
   'Inception', 'Inception', 'Your mind is the scene of the crime.',
   'Cobb steals information from the minds of his targets inside their dreams. Tasked with planting an idea, he and his team hazard a dangerous extraction into the layers of the dream.',
   2010, 148, 'PG-13', 'tt1375666', 'static', 'tt1375666', now(), 1),
  ('a1000000-0000-4000-8000-000000000004', 'pulp-fiction',
   'Pulp Fiction', 'Pulp Fiction', 'Just because you are a character doesn''t mean you have character.',
   'The lives of two mob hitmen, a boxer, a gangster and his wife, and a pair of diner bandits intertwine in four tales of violence and redemption.',
   1994, 154, 'R', 'tt0110912', 'static', 'tt0110912', now(), 1),
  ('a1000000-0000-4000-8000-000000000005', 'the-godfather',
   'The Godfather', 'The Godfather', 'An offer he can''t refuse.',
   'The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.',
   1972, 175, 'R', 'tt0068646', 'static', 'tt0068646', now(), 1)
on conflict (id) do nothing;

-- ── movie_genres ─────────────────────────────────────────────────────────────
insert into public.movie_genres (movie_id, genre_id)
values
  ('a1000000-0000-4000-8000-000000000001', 7),
  ('a1000000-0000-4000-8000-000000000002', 1),
  ('a1000000-0000-4000-8000-000000000002', 5),
  ('a1000000-0000-4000-8000-000000000002', 7),
  ('a1000000-0000-4000-8000-000000000003', 1),
  ('a1000000-0000-4000-8000-000000000003', 15),
  ('a1000000-0000-4000-8000-000000000003', 17),
  ('a1000000-0000-4000-8000-000000000004', 5),
  ('a1000000-0000-4000-8000-000000000004', 7),
  ('a1000000-0000-4000-8000-000000000005', 5),
  ('a1000000-0000-4000-8000-000000000005', 7)
on conflict do nothing;

-- ── movie_cast (primary key is generated; conflict target is the natural key) ─
insert into public.movie_cast (movie_id, person_id, character, cast_order, provider, provider_id, confidence)
values
  -- The Shawshank Redemption
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Andy Dufresne', 0, 'static', 'shawshank', 1),
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'Ellis Boyd ''Red'' Redding', 1, 'static', 'shawshank', 1),
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', 'Warden Norton', 2, 'static', 'shawshank', 1),
  -- The Dark Knight
  ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000005', 'Bruce Wayne / Batman', 0, 'static', 'dark-knight', 1),
  ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000006', 'Joker', 1, 'static', 'dark-knight', 1),
  ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000007', 'Harvey Dent', 2, 'static', 'dark-knight', 1),
  ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000008', 'Alfred', 3, 'static', 'dark-knight', 1),
  ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000009', 'James Gordon', 4, 'static', 'dark-knight', 1),
  -- Inception
  ('a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-00000000000b', 'Dom Cobb', 0, 'static', 'inception', 1),
  ('a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-00000000000c', 'Arthur', 1, 'static', 'inception', 1),
  ('a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-00000000000d', 'Ariadne', 2, 'static', 'inception', 1),
  ('a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-00000000000e', 'Mal', 3, 'static', 'inception', 1),
  ('a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-00000000000f', 'Saito', 4, 'static', 'inception', 1),
  ('a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000010', 'Eames', 5, 'static', 'inception', 1),
  -- Pulp Fiction
  ('a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000012', 'Vincent Vega', 0, 'static', 'pulp-fiction', 1),
  ('a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000013', 'Jules Winnfield', 1, 'static', 'pulp-fiction', 1),
  ('a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000014', 'Mia Wallace', 2, 'static', 'pulp-fiction', 1),
  ('a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000015', 'Butch Coolidge', 3, 'static', 'pulp-fiction', 1),
  ('a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000016', 'Marsellus Wallace', 4, 'static', 'pulp-fiction', 1),
  -- The Godfather
  ('a1000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000018', 'Vito Corleone', 0, 'static', 'godfather', 1),
  ('a1000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000019', 'Michael Corleone', 1, 'static', 'godfather', 1),
  ('a1000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-00000000001a', 'Sonny Corleone', 2, 'static', 'godfather', 1),
  ('a1000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-00000000001b', 'Tom Hagen', 3, 'static', 'godfather', 1),
  ('a1000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-00000000001c', 'Kay Adams', 4, 'static', 'godfather', 1)
on conflict (movie_id, person_id, character) do nothing;

-- ── movie_crew ───────────────────────────────────────────────────────────────
insert into public.movie_crew (movie_id, person_id, department, job, provider, provider_id, confidence)
values
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000004', 'Directing', 'Director', 'static', 'shawshank', 1),
  ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000004', 'Writing', 'Screenplay', 'static', 'shawshank', 1),
  ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-00000000000a', 'Directing', 'Director', 'static', 'dark-knight', 1),
  ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-00000000000a', 'Writing', 'Screenplay', 'static', 'dark-knight', 1),
  ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-00000000001d', 'Sound', 'Original Music Composer', 'static', 'dark-knight', 1),
  ('a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-00000000000a', 'Directing', 'Director', 'static', 'inception', 1),
  ('a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-00000000000a', 'Writing', 'Screenplay', 'static', 'inception', 1),
  ('a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-00000000001d', 'Sound', 'Original Music Composer', 'static', 'inception', 1),
  ('a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-00000000001e', 'Camera', 'Director of Photography', 'static', 'inception', 1),
  ('a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000011', 'Directing', 'Director', 'static', 'pulp-fiction', 1),
  ('a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000011', 'Writing', 'Screenplay', 'static', 'pulp-fiction', 1),
  ('a1000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000017', 'Directing', 'Director', 'static', 'godfather', 1),
  ('a1000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000017', 'Writing', 'Screenplay', 'static', 'godfather', 1)
on conflict (movie_id, person_id, department, job) do nothing;

-- ── movie_sources (provenance + conflict ledger) ─────────────────────────────
insert into public.movie_sources (id, movie_id, source_kind, source_name, source_id, source_url, confidence, conflict_status)
values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'static', 'cinemind-demo', 'tt0111161', null, 1, 'ok'),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'api', 'tmdb', '278', 'https://www.themoviedb.org/movie/278', 0.9, 'ok'),
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 'static', 'cinemind-demo', 'tt0468569', null, 1, 'ok'),
  ('b1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000002', 'api', 'tmdb', '155', 'https://www.themoviedb.org/movie/155', 0.9, 'ok'),
  ('b1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000003', 'static', 'cinemind-demo', 'tt1375666', null, 1, 'ok'),
  ('b1000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000003', 'api', 'tmdb', '27205', 'https://www.themoviedb.org/movie/27205', 0.9, 'ok'),
  ('b1000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000004', 'static', 'cinemind-demo', 'tt0110912', null, 1, 'ok'),
  ('b1000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000004', 'api', 'tmdb', '680', 'https://www.themoviedb.org/movie/680', 0.9, 'ok'),
  ('b1000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000005', 'static', 'cinemind-demo', 'tt0068646', null, 1, 'ok'),
  ('b1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000005', 'api', 'tmdb', '238', 'https://www.themoviedb.org/movie/238', 0.9, 'ok')
on conflict (movie_id, source_name, source_id) do nothing;

-- ── movie_financials (static reference facts, USD) ──────────────────────────
insert into public.movie_financials (id, movie_id, budget, revenue, currency, provider, provider_id, confidence)
values
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 25000000, 73304969, 'USD', 'static', 'tt0111161', 0.9),
  ('b2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 185000000, 1006234167, 'USD', 'static', 'tt0468569', 0.9),
  ('b2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 160000000, 836848102, 'USD', 'static', 'tt1375666', 0.9),
  ('b2000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', 8000000, 213928762, 'USD', 'static', 'tt0110912', 0.9),
  ('b2000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000005', 6000000, 250341816, 'USD', 'static', 'tt0068646', 0.9)
on conflict (movie_id, provider, provider_id) do nothing;

-- ── external_ratings (imdb aggregate scores from reference seed data) ────────
insert into public.external_ratings (id, movie_id, rating_name, score, score_type, votes, url, provider, provider_id, confidence)
values
  ('b3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'imdb', 9.3, 'out_of_10', 2800000, 'https://www.imdb.com/title/tt0111161/', 'static', 'tt0111161', 0.9),
  ('b3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'imdb', 9.0, 'out_of_10', 2700000, 'https://www.imdb.com/title/tt0468569/', 'static', 'tt0468569', 0.9),
  ('b3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'imdb', 8.8, 'out_of_10', 2400000, 'https://www.imdb.com/title/tt1375666/', 'static', 'tt1375666', 0.9),
  ('b3000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', 'imdb', 8.9, 'out_of_10', 2100000, 'https://www.imdb.com/title/tt0110912/', 'static', 'tt0110912', 0.9),
  ('b3000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000005', 'imdb', 9.2, 'out_of_10', 1900000, 'https://www.imdb.com/title/tt0068646/', 'static', 'tt0068646', 0.9)
on conflict (movie_id, rating_name, provider) do nothing;

-- ── demo user content ────────────────────────────────────────────────────────
insert into public.watchlists (user_id, movie_id, note)
values
  ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000001', 'Requires patience, worth it'),
  ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000002', null),
  ('00000000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000003', 'Re-watch carefully')
on conflict (user_id, movie_id) do nothing;

insert into public.favorites (user_id, movie_id)
values
  ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000004')
on conflict (user_id, movie_id) do nothing;

insert into public.watch_history (user_id, movie_id, status, progress_seconds)
values
  ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000001', 'finished', 8520),
  ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000002', 'planned', 0),
  ('00000000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000003', 'watching', 3600)
on conflict (user_id, movie_id, watched_at) do nothing;

insert into public.movie_ratings (user_id, movie_id, score)
values
  ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000001', 10),
  ('00000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000002', 9),
  ('00000000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000001', 8)
on conflict (user_id, movie_id) do nothing;

insert into public.reviews (id, user_id, movie_id, title, body, rating, status)
values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
   'a1000000-0000-4000-8000-000000000001',
   'Hope is a dangerous thing',
   'A slow, deliberate film that earns every beat. Robbins and Freeman ground it, and the finale lands like a gut punch. The best kind of prison drama.',
   10, 'published'),
  ('a3000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a2',
   'a1000000-0000-4000-8000-000000000002',
   'Why so serious?',
   'Ledger simplifies chaos itself. The action is muscular and the moral stakes land harder than any superhero film before it.',
   9, 'published')
on conflict (id) do nothing;

insert into public.review_likes (user_id, review_id)
values
  ('00000000-0000-4000-8000-0000000000a2', 'a3000000-0000-4000-8000-000000000001')
on conflict (user_id, review_id) do nothing;

insert into public.review_reports (review_id, reporter_id, reason)
values
  ('a3000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', 'spoilers')
on conflict (review_id, reporter_id) do nothing;

insert into public.conversations (id, user_id, title, provider, model, status)
values
  ('a4000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
   'My movie night planner', 'groq', 'llama-3.3-70b-versatile', 'active')
on conflict (id) do nothing;

insert into public.messages (id, conversation_id, role, content)
values
  ('a7000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'user',
   'What should I watch tonight?'),
  ('a7000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 'assistant',
   'Based on your watchlist, The Shawshank Redemption (1994, Drama) fits tonight. It is highly rated both on IMDb and by the community here.'),
  ('a7000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000001', 'tool',
   '{"tool":"lookup_movie","status":"succeeded"}'),
  ('a7000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000001', 'user',
   'Add it to my watch history as finished.')
on conflict (id) do nothing;

-- ── observability demo (service-role audits; bounded summaries only) ─────────
insert into public.agent_runs (
  id, user_id, conversation_id, provider, model, status, started_at,
  duration_ms, tools, facts_cited, confidence
)
values
  ('a5000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
   'a4000000-0000-4000-8000-000000000001', 'groq', 'llama-3.3-70b-versatile',
   'succeeded', now() - interval '1 hour', 1234,
   '{lookup_movie,sanitize}', 2, 0.90)
on conflict (id) do nothing;

insert into public.agent_tool_calls (id, run_id, tool_name, arguments, result_summary, status, duration_ms)
values
  ('a6000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001',
   'lookup_movie', '{"query":"The Shawshank Redemption"}'::jsonb,
   '{"match":"the-shawshank-redemption","found":true}'::jsonb, 'succeeded', 120),
  ('a6000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000001',
   'sanitize', '{"length":140}'::jsonb,
   '{"policy":"no_untrusted_instructions","passed":true}'::jsonb, 'succeeded', 40),
  ('a6000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000001',
   'lookup_movie', '{"query":"Inception"}'::jsonb,
   '{"match":null,"found":false}'::jsonb, 'failed', 15)
on conflict (id) do nothing;

commit;