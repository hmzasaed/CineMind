# Session log

Running log of significant Claude Code sessions on this repo. Newest entry on top.

---

## 2026-09-17 (evening) — UI/UX review: unblocking the cinematic redesign

The user asked for a cinematic 3D redesign. On inspection, a comprehensive
redesign had **already been applied** earlier the same day (every frontend file
touched between 12:28–12:57): the ink/gold palette, Fraunces + Inter +
JetBrains Mono, film-grain overlay, `glass` / `card-interactive` / `chip-mono`
primitives, `ease-cinematic`, scroll-aware glass header, `ApertureIcon` brand
mark + favicon, footer, BackToTop, `ScrollReveal`, and genuine pointer-driven
3D tilt on `MovieCard` — all with `prefers-reduced-motion` guards. So this
session verified that work and fixed what was actually blocking it, rather than
restyling over it.

### The site was completely broken in a browser

`frontend/src/lib/supabase.ts` had the same **duplicated-line corruption** seen
earlier in `agent/router.ts` and `providers/mock.ts`: duplicated imports, two
`if` statements sharing one closing brace, and two `createClient` calls. Every
route rendered an error screen (`client.getSession is not a function`) — all
six page screenshots were byte-identical. Rewrote the file, and fixed a second
latent bug while there: `getAuthClient()` returned the **root** Supabase client,
but `getSession`/`signInWithPassword` live on `.auth`, so auth would have been
broken even with valid syntax.

**Note:** that file's mtime was 13:21, i.e. it was modified *during* this
session — a 13:15 typecheck had passed. Something else is writing to this repo
concurrently and introducing this corruption pattern. Worth finding.

### No imagery at all — three real bugs in the TMDB provider

The cinematic design fell flat because every poster was a grey placeholder. The
mock provider's poster URLs point at `example.invalid` (deliberately
unresolvable — the source of the `ERR_NAME_NOT_RESOLVED` console noise), so real
imagery requires `MOVIE_PROVIDER=tmdb`. That path was broken three ways:

1. **Auth style.** `TmdbProvider` only sent `Authorization: Bearer`, which is
   the v4 read-token flow. The configured key is a classic 32-char v3 key,
   which must go in an `api_key` query param — as a Bearer token it 401s on
   every request. Now detects the credential style and uses the right one.
2. **One bad record killed whole pages.** TMDB returns `release_date: ""` for
   titles with no announced date; the strict regex rejected it, and because the
   schema validates an entire results page, a single dateless title in a
   20-result search 502'd the whole search. Blank now parses as "unknown".
3. **Image URLs pointed at the API host.** All image helpers joined onto
   `TMDB_API_BASE_URL`, producing `api.themoviedb.org/3/t/p/...`, which 404s.
   TMDB serves images from `image.tmdb.org`; added a fixed `TMDB_IMAGE_BASE`
   and removed the now-unused `baseUrl` params.

With those fixed the site renders real posters, backdrops and cast headshots —
which is what actually makes it look cinematic.

### Design fixes

- **Hero 3D poster fan** (`HomePage`): the hero's right ~45% was empty
  decoration. Added a three-poster stack with real perspective/rotation/depth,
  a warm key light, and staggered fade-in, hidden below `lg` and `aria-hidden`
  (the Featured grid below already exposes the same titles as real links).
  Gotcha worth remembering: it must use `animate-fade-in`, not
  `animate-fade-up` — fade-up animates `transform`, and an animation with
  `fill-mode: both` overrides an inline `transform`, which flattened all three
  posters into one pile.
- **Detail-page poster was cropped.** The hero grid stretched the poster column
  to the row height, overriding the `aspect-[2/3]` box so `object-cover` cut off
  the artwork. Fixed with `self-start`.
- **Stale copy.** The movie page still told users watched state and ratings were
  "kept on this device" — untrue since they became backend-backed.

### Verified

Playwright screenshots at 1440px and 390px across home/discover/search/upcoming/
movie/login: **zero console errors**, correct mobile stacking. Frontend 30/30
tests + typecheck + build clean; backend 210/210 + typecheck clean (the
occasional `worker.test.ts` failure is the known pre-existing timing flake —
passed on both re-runs).

### Open

- `MOVIE_PROVIDER` is still `mock` in `.env`. Real imagery needs `tmdb`, which
  also needs the Supabase credentials (already configured). Left as the user's
  configuration decision rather than changed for them.

---

## 2026-09-17 (later) — Wiring to the real Supabase project; bugs only a live DB could surface

Follow-on to the session below. The user supplied live Supabase credentials
(project URL, anon key, service-role key, DB password) to connect the app to
the real project.

### Security note (action required)

The service-role key and the database password were pasted into a chat
transcript. **Both should be rotated** in the Supabase dashboard (Settings →
API → service_role key; Settings → Database → password). The anon key is
public-by-design (it ships in the browser bundle) and does not need rotation.
Verified `.env` / `frontend/.env` are gitignored, untracked, and have never
been committed — so nothing leaked through git.

### Setup bugs found and fixed (the app could not run against Supabase at all)

1. **Nothing loaded `.env`.** There was no `dotenv` dependency anywhere and no
   `--env-file` flag, so `loadConfig` only ever saw the ambient environment.
   `pnpm dev:backend` crashed with "Auth is not configured" and the Supabase
   credentials in `.env` never reached the app. Added `dotenv`, plus
   `backend/src/env.ts` (resolves the repo-root `.env`, with an optional
   `backend/.env` override), imported first in `server.ts` and `worker.ts`.
2. **A blank env var crashed startup.** `.env` had `JWT_SECRET=` (empty), and
   an empty string is not `undefined`, so Zod validated it against `.min(24)`
   and threw — even though `SUPABASE_URL` was set and `JWT_SECRET` was not
   needed. `loadConfig` now strips blank values before parsing, so leaving
   optional vars empty behaves like leaving them out.
3. **`VITE_SUPABASE_ANON_KEY` was empty** in both `.env` and `frontend/.env`,
   which would have broken frontend auth entirely. Populated from the anon key.

### Migration bugs in 00004 — found only by applying it to a real database

All four migrations were applied to the (previously completely empty) project
via a direct pooler connection; 25 tables now exist. Applying them surfaced two
genuine defects in the migration written in the previous session:

1. **`get_profile_stats` was callable by `anon` and `authenticated`.**
   `revoke execute ... from public` does **not** remove the grants Supabase's
   `alter default privileges` rules hand to `anon`/`authenticated`. Because the
   function is `security definer` and takes the subject as a parameter, any
   logged-in user — or an anonymous caller — could have read **another user's**
   profile statistics straight through PostgREST. Fixed with an explicit
   `revoke execute ... from anon, authenticated`, and verified empirically:
   the call now returns `42501 permission denied`.
2. **The like/report counters were never backfilled.** Seed data inserts a
   `review_like` before 00004 creates the trigger, so `review_likes` had a row
   while `reviews.likes_count` stayed `0`. A trigger only fires on new writes,
   so any pre-existing data (seeds, or a live deployment's existing rows) would
   have been permanently uncounted. 00004 now backfills both counters
   idempotently; verified `likes_count=1` / `report_count=1` on the seeded rows.

### Seed bugs (pre-existing) — demo accounts could never sign in

- The committed bcrypt literal in 00002 is **not** a hash of `"password"`
  (verified with `crypt()` against the live DB), contradicting the README.
- The GoTrue token columns (`confirmation_token`, `recovery_token`, …) were
  `NULL` rather than `''`; GoTrue scans them into non-nullable Go strings, which
  breaks sign-in and refresh.
- `instance_id` used a v4-shaped UUID instead of GoTrue's conventional all-zero
  UUID.

00002 now sets the password authoritatively with pgcrypto
(`crypt('password', gen_salt('bf'))`), coalesces every token column to `''`, and
uses the all-zero `instance_id`. The first two fixes are applied and verified on
the live DB; **demo sign-in was still failing when direct DB access was cut off,
so the `instance_id` fix is reasoned but UNVERIFIED** — see "Open" below.

### Verified working

- Backend boots against the real project and serves the Supabase-backed store
  paths end-to-end (previously 500s on every one, since no tables existed):
  `GET /movies/:id/reviews` and `/ratings/summary` return 200 with correct
  pagination metadata and provenance; `/profile/stats` still 401s unauthenticated.
  This is the first time `SupabaseReviewStore` / `SupabaseRatingStore` code has
  actually executed against Postgres.
- Backend 210/210 tests and frontend 30/30 tests pass; both typecheck clean.
  Note `src/jobs/worker.test.ts > reschedules transient failures` is **flaky**
  under parallel load (failed once, passed in isolation and on two full re-runs)
  — pre-existing timing sensitivity, not a regression.

### Open

- **Demo sign-in still returns `invalid_credentials`.** The password hash and
  NULL-token fixes are applied to the live DB; the `instance_id` correction is
  in the migration file but was never re-applied/verified, because the sandbox
  blocked further direct production-database reads. Re-run 00002 and retry, or
  simply create a fresh account through the app's own sign-up flow.
- Migrations were applied by direct SQL, so `supabase_migrations.schema_migrations`
  has no rows. A later `supabase db push` will try to re-apply all four — which
  is safe, since every migration is idempotent by design.
- 00002 seeds three demo accounts with the password `password`. Fine for a dev
  project; remove them before anything public-facing.
- pgTAP suite still unrun (needs Docker + the Supabase CLI).

---

## 2026-09-17 — Social features: ratings, reviews, moderation, watchlist/favorites/profile stats

### Starting state

The repo failed to build (`tsc` syntax errors) and had a large feature request pending:
user ratings (with optional category sub-scores), review CRUD with edit/delete
ownership, likes, reports, pagination/sorting, moderation status, spoiler flags,
watchlist, favorites, watched state, and profile statistics — with strict
per-user ownership and user ratings kept separate from external/AI critic scores.

Investigation found the DB schema for almost all of this **already existed**
(`supabase/migrations/00001_initial_schema.sql`: `movie_ratings`, `reviews`,
`review_likes`, `review_reports`, `watchlists`, `favorites`, `watch_history`,
all with RLS), but there were **zero backend routes/stores** and **zero real
frontend UI** for any of it. The backend only had an in-memory (non-persistent)
watchlist; the frontend only had a localStorage-only "watched + rating" feature.

### What was fixed

- `backend/src/agent/router.ts` — a duplicated/unclosed object literal entry
  (`"search.discover"` appeared twice, the first never closed) that cascaded
  into a `TS1005` syntax error 100 lines later. Also 3 sibling entries
  (`compare.movies`/`compare.ratings`/`compare.financials`) each had a dead,
  shadowed first `tools:` line.
- `backend/src/providers/mock.ts` — duplicate `const`/`let value` redeclaration
  in `MockProvider.getMovie`.
- `frontend/src/components/ErrorBoundary.tsx` — unused `React` import
  (frontend `tsc -b` was failing too).

### What was built

**Database** — `supabase/migrations/00004_social_features.sql`:
- `reviews.has_spoilers` (boolean) and `reviews.likes_count` (trigger-maintained).
- Fixed a real security gap: 00001's blanket `grant update on reviews to
  authenticated` would have let any owner overwrite `likes_count`/`report_count`
  directly via PostgREST. Revoked and re-granted column-by-column; both
  counters are now written only by `security definer` trigger functions.
- New table `movie_rating_categories` (acting/story/visuals/sound/pacing,
  1–10, ≤1 per category per rating), RLS scoped through the parent
  `movie_ratings` row's ownership.
- `public.get_profile_stats(p_user_id uuid)` — takes an explicit user id
  (not `auth.uid()`) because every backend store uses the service-role
  client, under which `auth.uid()` is always null; safety comes from
  `execute` being granted only to `service_role`.

**Backend** — new `backend/src/social/` module:
- `movie-resolver.ts` — bridges provider-native movie ids (what the frontend
  knows) to internal Postgres uuids (what the new tables FK to), doing a
  lightweight core-fields-only ingest on first write, never on read.
- `ratings-store.ts`, `reviews-store.ts`, `moderation-store.ts`,
  `profile-stats-store.ts`, `library-stores.ts` (favorites + watch history) —
  each with a Supabase-backed implementation and an in-memory one for
  dev/tests without Supabase configured.
- New routes: `routes/ratings.ts`, `routes/reviews.ts`, `routes/moderation.ts`,
  `routes/library.ts`, `routes/profile.ts`. Watchlist's route was left
  unchanged; only its backing store became Supabase-capable.
- `app.ts`/`config.ts` wired up all of it, plus per-route rate limits for
  review creation (5/hour default) and reporting (10/hour default).
- Ownership rule used everywhere: edit/delete of another user's review,
  rating, favorite, or history entry returns **404, not 403** — existence is
  never leaked by a different status code. Acting user id always comes from
  `req.auth!.userId`, never a client-supplied param.

**Frontend**:
- `lib/api.ts` / `lib/queries.ts` extended with every new endpoint's types,
  client methods, and React Query hooks.
- New components: `ReviewForm`, `ReviewsSection`, `ReviewCard` (spoiler gate —
  body text is absent from the DOM entirely until "Show anyway" is clicked,
  not just CSS-hidden), `ReportReviewModal`, `CategoryRatingInput`,
  `FavoriteButton`, `ProfileStatsPanel`.
- Deleted `lib/user-movie.ts` (the old localStorage-only watched/rating
  store) and rewired `MoviePage.tsx`/`AccountPage.tsx` onto the real backend
  hooks. `AccountPage` gained Favorites and Reviews tabs.

**Tests**: `app.ratings.test.ts`, `app.reviews.test.ts`,
`app.moderation.test.ts`, `app.library.test.ts` (43 new backend tests);
`ReviewCard.test.tsx`, `CategoryRatingInput.test.tsx`, `FavoriteButton.test.tsx`,
plus extended `api.test.ts` (18 new frontend tests). Extended
`supabase/tests/database/cinemind_tests.sql` from 52 to 64 pgTAP assertions,
including a regression test for the likes_count/report_count column-grant fix
and a trigger-sync test.

**Docs**: new `docs/ratings.md`, `docs/reviews.md`, `docs/moderation.md`,
`docs/watchlist-favorites.md`; updated `docs/README.md`, `docs/database.md`,
and the root `README.md` (API reference table, table/test counts, roadmap).

### Verification performed

- Backend: `tsc --noEmit` clean, `vitest run` → **210/210 passing**.
- Frontend: `tsc -b --noEmit` clean, `vitest run` → **30/30 passing**.
- Both `pnpm build` (backend `tsc`, frontend `tsc -b && vite build`) succeed.
- Booted the real backend server (`node dist/server.js`, mock provider) and
  exercised the new endpoints live with `curl` — rating upsert with category
  scores, review create, review list, profile stats — not just under the
  vitest/`.inject()` harness.
- Could **not** run `supabase db test` (pgTAP) here — no Docker/Supabase CLI
  in this environment. The assertion count (64) was verified by grepping the
  test file, but the suite itself needs a manual run.

### Known gaps / follow-ups

- No admin frontend page — moderation (`/admin/review-reports`,
  `/admin/reviews/:id/status`) is backend-only by explicit agreement with the
  user this session. Endpoints are built, tested, and documented.
- pgTAP suite (`supabase/tests/database/cinemind_tests.sql`) needs a manual
  `supabase db test` run in an environment with Docker.
- A pile of unrelated pre-existing uncommitted changes were present in the
  working tree at session start and are **not** part of this session's work
  (confirmed via file mtimes predating the session): `.env.example` deletions,
  `frontend/src/App.tsx`, lockfiles, `docs/providers.md`, and a few other
  frontend pages. Left untouched.
