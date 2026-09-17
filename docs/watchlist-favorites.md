# Watchlist, favorites, watch history & profile statistics

Three structurally identical owner-only tables, plus one function that
aggregates across all of them (and ratings/reviews) for a user's profile page.

## Schema

- `public.watchlists`, `public.favorites` — near-identical: `(user_id,
  movie_id)` unique, `for all using (auth.uid() = user_id) with check
  (auth.uid() = user_id)`.
- `public.watch_history` — same owner-all policy, but unique on `(user_id,
  movie_id, watched_at)` instead of just `(user_id, movie_id)`: marking a
  movie "finished" twice (a rewatch) is a legitimate new row, not an edit.
  `status in ('planned','watching','paused','finished','abandoned')`.

## The movie-identity bridge (read this before touching any of these stores)

The read side of the app (`backend/src/routes/movies.ts`, `providers/*`) is
100% live-provider data, keyed by the **provider-native id** (a TMDB numeric
id, or the mock provider's `tt...` ids) — it never touches Postgres. But
`watchlists`/`favorites`/`watch_history`/`movie_ratings`/`reviews` all foreign-key
to `movies.id`, an internal uuid populated only by ingestion.

`backend/src/social/movie-resolver.ts`'s `resolveMovieDbId(adapter,
ingestionStore, providerMovieId)` bridges the two: it first tries
`ingestionStore.getMovieId()` (a cheap DB lookup, the hot path once a movie
has been touched once), and on a miss, ingests a **lightweight, core-fields-only**
record (`ingestMovie(..., { includeRelations: false })` — one `adapter.getMovie()`
call + one `movies` upsert, not the full cast/crew/financials fan-out
`worker.ts` does for the catalog). This is a deliberate, narrow exception to
the "no inline ingestion" rule documented in `services/ingestion.ts`, made
because the alternative (enqueue-and-ask-the-user-to-retry) is materially
worse UX for a first-time rate/review/favorite.

**Only write paths call this.** Reads call `ingestionStore.getMovieId()`
directly and return an empty/zero result on a miss — the movie is still
valid, it just has no user content yet; a GET must never trigger ingestion.

Every DTO returned to the frontend carries the **provider-native id** back
(joined via `movies.provider_id`), never the internal uuid, so existing
frontend code that only ever knew provider ids keeps working unchanged.

## Backend

`backend/src/social/library-stores.ts` — `SupabaseWatchlistStore` /
`SupabaseFavoritesStore` / `SupabaseWatchHistoryStore` (+ in-memory
equivalents for dev/tests without Supabase configured), each reconstructing a
`MovieRecord` for list views from the `movies` row via
`social/movie-mapper.ts` (deliberately omitting the aggregate rating field —
that's a join too far for a watchlist card; the movie detail page always
reads the live, authoritative provider data instead).

- **Watchlist** (`routes/watchlist.ts`, unchanged route shape): `POST` is
  pre-checked, duplicate → `409`.
- **Favorites** (`routes/library.ts`): idempotent `PUT`/`DELETE` toggle —
  adding an already-favorited movie is a no-op `204`, not a `409`. Chosen
  because a favorite is a boolean relationship better suited to toggle UI
  than watchlist's list-with-conflict semantics.
- **Watch history** (`routes/library.ts`): `POST` never conflicts (the
  `(user_id, movie_id, watched_at)` unique constraint makes every add a new
  row); `DELETE /watch-history/:id` is owner-scoped.

## Profile statistics

`GET /profile/stats` → `backend/src/social/profile-stats-store.ts`. In
production this calls `public.get_profile_stats(p_user_id uuid)` (added in
00004) via the service-role client's `.rpc()`.

That function takes an **explicit `p_user_id` parameter instead of reading
`auth.uid()`**, and this is not a stylistic choice — every store in this
codebase calls Postgres through the service-role admin client
(`services/supabase.ts`), never a per-request client scoped to the caller's
own JWT, so `auth.uid()` would always evaluate to `null` under that client and
the function would silently return empty stats for everyone. Safety instead
comes from the grant: `execute` is revoked from `PUBLIC`/`anon`/`authenticated`
and granted only to `service_role`, so only the trusted backend — which
always passes `req.auth!.userId`, never client input — can call it at all.

> **`revoke ... from public` is not sufficient on Supabase.** Supabase ships
> `alter default privileges` rules that explicitly grant `EXECUTE` on new
> public-schema functions to `anon` and `authenticated`, and those explicit
> grants survive a revoke aimed only at the `PUBLIC` pseudo-role. This was
> caught against a live project: the function was callable by `anon` with an
> arbitrary `p_user_id`, leaking any user's statistics. 00004 therefore also
> does an explicit `revoke execute ... from anon, authenticated`. If you add
> another service-role-only function, do the same and verify with
> `aclexplode(proacl)` rather than assuming.

A
plain SQL *view* was considered and rejected for the same reason `is_admin()`
needs `security definer`: a view runs with its owner's privileges unless
explicitly marked `security_invoker`, a well-known Supabase footgun that would
silently bypass RLS on every underlying table.

`InMemoryProfileStatsStore` (dev/tests without Supabase) computes the
identical six fields by calling the other in-memory stores directly, so the
numbers match in both environments without duplicating the aggregation logic
in two places server-side.
