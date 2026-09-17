# Reviews

Text reviews (20–20,000 chars) with an optional title and 1–10 rating, likes,
reports, pagination, sorting, and a spoiler flag.

## Schema

`public.reviews` (00001, extended in 00004): one row per `(user_id,
movie_id)`, `status in ('published','hidden','deleted')`, `report_count` and
`likes_count` (the latter added in 00004). `public.review_likes` is a plain
`(user_id, review_id)` join table with public read. See
[moderation.md](moderation.md) for `review_reports` and the status state
machine.

**Trigger-maintained counters, not app-writable.** `likes_count` and
`report_count` are updated only by `security definer` trigger functions
(`review_likes_count_sync`, `review_reports_count_sync` in
`00004_social_features.sql`), fired on `review_likes`/`review_reports`
inserts. The blanket `grant update on reviews to authenticated` from 00001 is
revoked and re-granted column-by-column (`title, body, rating, language_code,
status, has_spoilers` only) in the same migration — without that fix, any
owner could set their own `likes_count` to an arbitrary number via a raw
PostgREST call. `supabase/tests/database/cinemind_tests.sql` has a direct
regression test for this.

## Backend

`backend/src/social/reviews-store.ts` (`ReviewStore` interface + Supabase/in-memory
impls) and `backend/src/routes/reviews.ts`. All stores use the service-role
client, which bypasses RLS entirely — so the store re-implements the same
visibility rule RLS would otherwise enforce (`status = 'published' OR
user_id = viewer OR admin`) in application code. Read `reviews-store.ts`'s
`list()`/`getById()` before touching this file; it's the one place that
matters for not leaking hidden/deleted reviews.

| Endpoint | Notes |
|---|---|
| `GET /movies/:id/reviews` | Public; optional auth (`optionalAuth` middleware) includes the viewer's own non-published review and `likedByMe`. `?page&pageSize&sort` (`newest`/`oldest`/`top_rated`/`most_liked`). |
| `POST /movies/:id/reviews` | Auth; rate-limited (`REVIEW_RATE_LIMIT_MAX`/hour, default 5). Pre-checked duplicate → 409, not a caught constraint violation. |
| `PATCH /reviews/:id` | Owner-scoped at the store layer (`.eq('id', id).eq('user_id', userId)`). A non-owner's edit request gets **404, not 403** — existence of another user's review is never leaked by a different status code. |
| `DELETE /reviews/:id` | Same ownership scoping/404 convention. |
| `PUT` / `DELETE /reviews/:id/like` | Idempotent toggle (insert-if-absent / delete-if-present), always `204`. Different from watchlist's 409-on-duplicate style — a like is a boolean relationship, not a "already have this" conflict. |
| `POST /reviews/:id/report` | Auth; rate-limited (`REPORT_RATE_LIMIT_MAX`/hour, default 10). Pre-checked duplicate report (same reporter, same review) → 409. |
| `GET /reviews/mine` | Paginated, cross-movie list of the caller's own reviews. |

## Spoiler flag — a client-trust boundary

`has_spoilers` is a plain boolean the backend stores and returns as-is; **the
backend does not redact review text**. The frontend (`ReviewCard.tsx`) is
solely responsible for the gate: when `hasSpoilers` is true and the reader
hasn't clicked "Show anyway", the review body is not rendered into the DOM at
all (not just CSS-hidden), so it can't leak via find-in-page or a screen
reader before the reader opts in. This mirrors `docs/security.md`'s "trusting
untrusted content" framing — the API's job is to carry the flag faithfully;
the client enforces the gate for the reader who set it.

## Validation

- `body`: 20–20,000 chars (matches the DB `check`).
- `title`: ≤200 chars, optional.
- `rating`: 1–10, optional (a review doesn't require a score).
- `languageCode`: `^[a-z]{2}$`, defaults to `en`.
- Owner-only edits; `status` via `PATCH /reviews/:id` may only be
  `published`/`hidden` — only `PATCH /admin/reviews/:id/status` (see
  [moderation.md](moderation.md)) may set `deleted`.
