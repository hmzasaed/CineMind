# Database

CineMind's MVP persistence target is **Supabase (PostgreSQL)**. The schema is
normalized, provenance-aware, and deliberately free of any vector/embedding
objects (per project constraints there is no RAG, no `pgvector`, no
`pg_trgm`).

```
supabase/
  migrations/
    00001_initial_schema.sql      # 21-table normalized MVP schema + RLS
    00002_seed_reference_data.sql # deterministic reference + demo fixtures
  tests/
    database/
      cinemind_tests.sql          # pgTAP suite (supabase db test)
```

## Migration replay

All migrations are idempotent:

- object creation uses `create ... if not exists` (or guarded `create type`);
- policies/triggers are created after `drop policy if exists` / `drop trigger
  if exists`;
- every seed insert is `on conflict do nothing`.

So all three of these are safe:

```bash
# 1. Fresh project
supabase db reset

# 2. Re-apply over an already-migrated database (idempotent)
supabase migration up

# 3. Load only the fixtures (no data loss)
psql "$DATABASE_URL" -f supabase/migrations/00002_seed_reference_data.sql
```

## Running tests

The committed suite is pgTAP (what `supabase db test` executes):

```bash
supabase db test
```

To run the same guarantees against a vanilla PostgreSQL that lacks pgTAP (as
verified in CI/dev from scratch), apply the migrations then run the plain-SQL
assertion script shipped in this repo:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/00001_initial_schema.sql \
  -f supabase/migrations/00002_seed_reference_data.sql \
  -f supabase/tests/database/cinemind_tests.sql
```

The tests assert, at minimum:

- presence of all 21 tables;
- seed counts (19 genres, 5 movies, 24 cast rows, …);
- uniqueness violations raise `23505` (slug, source natural key, watchlist,
  review, rating);
- RLS: `anon` reads the catalog but can write nothing, `authenticated` can only
  write its own rows, admins can moderate, `service_role` alone can see
  `agent_runs`/`agent_tool_calls`;
- `profiles.role` is not client-updatable (column-level grant).

## Table reference

| # | Table | Purpose | Writer |
|---|-------|---------|--------|
| 1 | `profiles` | User profile + `role` (`user`/`admin`) | self (guard columns) |
| 2 | `movies` | Canonical movie facts | server pipelines |
| 3 | `people` | Canonical person facts | server pipelines |
| 4 | `genres` | Reference genre catalog | server pipelines |
| 5 | `movie_genres` | N:M movies × genres | server pipelines |
| 6 | `movie_cast` | Cast credits (ordered) | server pipelines |
| 7 | `movie_crew` | Crew credits | server pipelines |
| 8 | `movie_sources` | Provenance + conflict ledger | server pipelines |
| 9 | `movie_financials` | Budget/revenue facts | server pipelines |
| 10 | `external_ratings` | IMDb/RT/… aggregate scores | server pipelines |
| 11 | `movie_ratings` | User star ratings (1–10) | owner |
| 12 | `reviews` | User reviews (soft-deletable) | owner + admin |
| 13 | `review_likes` | Likes on reviews | owner |
| 14 | `review_reports` | Moderation reports | reporter + admin |
| 15 | `watchlists` | User watchlists | owner |
| 16 | `favorites` | User favorites | owner |
| 17 | `watch_history` | Watch status/progress | owner |
| 18 | `conversations` | Chat threads | owner (+admin read) |
| 19 | `messages` | Chat messages | conversation owner |
| 20 | `agent_runs` | AI run audit (summaries only) | service_role |
| 21 | `agent_tool_calls` | Bounded tool-call trace | service_role |

## Provenance & conflict model

Every fact-carrying table carries a shared provenance spine:

- `provider` — who supplied the fact (`tmdb`, `static`, `manual`, …);
- `provider_id` — the id at that provider;
- `retrieved_at` — when the fact was captured;
- `confidence` — `0..1`, set by the writer pipeline.

`movie_sources` is the **conflict ledger**: one row per (movie, source) with
`conflict_status in ('ok','conflict','stale')`, a `revision` counter, and a
bounded `payload` JSONB object. `movies.data_version` provides optimistic
concurrency for fact updates. This is how CineMind resolves disagreements
between sources without letting an LLM be authoritative: the database keeps
the facts, the conflict state is explicit, and prompt responses cite rows from
these tables.

## Security model

- **RLS enabled on every public table.** Public (anon) can SELECT the catalog
  and published reviews; writers are owners; admins (`is_admin()`) can
  moderate; `service_role` bypasses RLS for server pipelines.
- **No client grants** exist on `agent_runs` / `agent_tool_calls`: they are
  service-role-only observability stores. `messages` inherits access from its
  owning conversation.
- **Column-level grants**: `authenticated` may update only
  `username`, `display_name`, `avatar_url` on `profiles` — `role` is not
  client-writable.
- Helper functions:
  - `public.set_updated_at()` — BEFORE UPDATE trigger keeping `updated_at` fresh;
  - `public.is_admin()` — SECURITY DEFINER helper read by RLS policies.
- Two RLS subtleties are encoded (and tested) in this schema:
  1. PostgreSQL **AND-combines `WITH CHECK` across all UPDATE policies**, so a
     separate admin policy with its own `WITH CHECK` would block ordinary
     owners — `reviews` uses a single owner-or-admin UPDATE policy instead.
  2. The **new row of an UPDATE must pass the SELECT policies** too, so the
     reviews SELECT policy lets owners see their own rows in any status.

## Deterministic seed fixtures

`00002` inserts fixed-UUID fixtures so every reset reproduces identical data:

- Demo users (password is `password` for all three):
  - `demo1@cinemind.example` (role `user`)
  - `demo2@cinemind.example` (role `user`)
  - `admin@cinemind.example` (role `admin`)
- 19 canonical genres, 5 movies (with TMDB/IMDb ids), 30 people, 24 cast
  rows, 13 crew rows, 10 provenance rows, 5 financials, 5 external ratings,
  plus realistic user content (watchlists, favorites, watch history, ratings,
  reviews, likes, a report) and a sample `agent_run` with 3 tool calls.
- Reference facts live in `data/reference/` / `data/seeds/` and ship with
  `source_kind = 'static'`.