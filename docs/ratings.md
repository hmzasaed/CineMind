# User ratings

CineMind users can rate any movie 1–10, plus optional acting/story/visuals/sound/pacing
sub-scores. This is **entirely separate** from the provider/critic score
(`GET /movies/:id/ratings`, TMDB/mock data) and from any future AI-generated
score — the three never merge in the schema, the API, or the UI.

## Schema

- `public.movie_ratings` (00001) — one row per `(user_id, movie_id)`, `score
  smallint check (score between 1 and 10)`. Public `select`; owner-only
  insert/update/delete.
- `public.movie_rating_categories` (00004) — 0–5 optional sub-scores per
  rating, `category in ('acting','story','visuals','sound','pacing')`, unique
  per `(movie_rating_id, category)`. RLS write policy checks the *parent*
  rating's ownership (`exists (select 1 from movie_ratings mr where mr.id =
  movie_rating_id and mr.user_id = auth.uid())`), since the child table has no
  `user_id` column of its own.

## Backend

`backend/src/social/ratings-store.ts` — `RatingStore` interface, `SupabaseRatingStore`
(production) and `InMemoryRatingStore` (dev/tests without Supabase configured),
selected by `createRatingStore(config, adapter, ingestionStore)`.

- `PUT /movies/:id/rating` — **upsert**, not create-or-409: the DB unique
  constraint on `(user_id, movie_id)` makes re-rating a movie a normal update,
  never a conflict. Category rows are replaced (delete-then-insert) on every
  write, the same idiom `services/ingestion.ts` uses for movie relations.
- `GET /movies/:id/rating` — the caller's own rating, or `null`.
- `DELETE /movies/:id/rating` — owner-scoped delete; cascades category rows.
- `GET /movies/:id/ratings/summary` — **public**, DB-only aggregate
  (`{ average, count, categories }`), computed from `movie_ratings` +
  `movie_rating_categories`. This is a distinct endpoint from the
  provider/critic `GET /movies/:id/ratings` — read `routes/movies.ts` to
  confirm that one never touches these tables.
- `GET /ratings/mine` — paginated, cross-movie list of the caller's own
  ratings, for the account page.

All write paths resolve the provider-native movie id to the internal
`movies.id` uuid via `backend/src/social/movie-resolver.ts` (see
[watchlist-favorites.md](watchlist-favorites.md) for why that bridging step
exists and how it works). Read paths never trigger that resolution — an
unrated, never-persisted movie just returns an empty summary, not a 404.

## Validation

- `score`: integer 1–10, required.
- `categories`: optional array, ≤5 entries, each `{category, score: 1-10}`,
  no duplicate `category` values in one payload (Zod `.refine`).
- Ownership: every read/write is scoped to `req.auth!.userId` — a client can
  never read or modify another user's rating; there is no `userId` request
  parameter anywhere in this API.
