# Provider integration

Every external integration lives behind an interface and is selected by
configuration. Adding a provider never requires touching route code.

## Movie data providers (backend)

The backend has a two-layer movie-data interface:

- `backend/src/providers/types.ts` (`MovieDataProvider`) — the raw source
  contract. One method per capability, each returning `Fact<T|null>`.
- `backend/src/providers/decorators.ts` (`MovieDataAdapter`) — the resilient
  adapter used by routes: every raw provider is composed through
  **cache → quota-gate → retry → timeout** decorators, so resilience lives in
  one place and never in route code.

Implemented: `mock` (static facts), `tmdb` (structured API).

Config: `MOVIE_PROVIDER` selects the implementation. Secrets stay in env.
`createMovieDataAdapter(config)` in `providers/index.ts` builds the raw
provider and wraps it.

### Capabilities

| Capability | `MovieDataProvider` method | Route |
| ---------- | -------------------------- | ----- |
| Movie detail | `getMovie(id)` | `GET /movies/:id` |
| Search | `searchMovies(query)` | `GET /movies?title=&year=` |
| Upcoming | `getUpcoming(options)` | `GET /movies/upcoming` |
| Credits | `getCredits(id)` | `GET /movies/:id/credits` |
| Images | `getImages(id)` | `GET /movies/:id/images` |
| Ratings | `getRatings(id)` | `GET /movies/:id/ratings` |
| Production companies | `getCompanies(id)` | `GET /movies/:id/companies` |
| Financials | `getFinancials(id)` | `GET /movies/:id/financials` |

Not every provider must implement every capability: unsupported capabilities
return a null-valued `Fact`, and the route answers 404. `getMovie` never
returns an empty record and never falls back to a mock when the real source
fails.

### Resilience & errors

- `providers/errors.ts` — `ProviderError` with an error code
  (`NOT_FOUND`, `INVALID_RESPONSE`, `UPSTREAM_TIMEOUT`, `UPSTREAM`,
  `UPSTREAM_RATE_LIMITED`, `UPSTREAM_QUOTA`), a status, an optional
  `retryAfterMs`, and an attempt count. `isRetryable` / `isTransient`
  classify errors; `providerHttpStatus` maps them to HTTP responses.
- `providers/decorators.ts` — applied in this order per method:
  1. `Cache` — TTL cache (default 5 min, `PROVIDER_CACHE_TTL_MS`); on a
     transient failure, serves a **stale** entry when
     `PROVIDER_CACHE_STALE_ON_ERROR=true`. Exposed as
     `x-provider-cache: hit | miss | stale`.
  2. `QuotaGate` — after a 429, blocks further calls until the cooldown ends,
     failing fast with `UPSTREAM_QUOTA` instead of hammering the API.
  3. `withRetry` — retries transient errors with exponential backoff + jitter
     (`PROVIDER_RETRY_LIMIT`, `PROVIDER_BASE_BACKOFF_MS`), honoring
     `retryAfterMs` (capped at 60 s). Never retries `NOT_FOUND` /
     `INVALID_RESPONSE`.
  4. `withTimeout` — aborts a hung request after `PROVIDER_TIMEOUT_MS`
     (`UPSTREAM_TIMEOUT`).

### Attribution

Every adapter carries `attribution` (`licensed: boolean`, `title`, `termsUrl`).
The TMDB adapter sets `licensed: true` with the TMDB terms URL and **never
scrapes the web**; when TMDB is configured it is the only movie-data source.
The mock adapter is `licensed: false` and labelled "test only" — it must never
be used in production.

### Ingestion & jobs

The adapter feeds facts into Supabase via `services/ingestion.ts`
(`ingestMovie`), which is idempotent by `unique(provider, provider_id)` on
`movies.movie_sources`; re-ingests bump `movie_sources.revision` and rebuild
relation rows (delete-then-insert). Ingestion runs **only** from the worker
(`jobs/worker.ts`, entrypoint `backend/src/worker.ts`), never inside an HTTP
request:

- `refresh_movie` — ingest one movie by id (created on demand as `refresh_movie`
  jobs fan out from `refresh_upcoming` for movies the DB doesn't know yet).
- Job stores are `jobs/store.ts` (`SupabaseIngestionJobStore` /
  `InMemoryIngestionJobStore`, selected like the ingestion store); the Supabase
  store claims and locks rows with optimistic concurrency.
- An admin can enqueue/inspect jobs: `POST /admin/jobs` (202), `GET /admin/jobs`,
  `GET /admin/jobs/:id` (all `JWT + admin`).

To add a provider: implement `MovieDataProvider`, validate every response with a
Zod schema, return `Fact<T>` (facts only, never synthesized values), register it
in `providers/index.ts` behind a new env value, and give it a distinct
`sourceName` / `sourceKind`. Convention: unknown ids return null (404); outages
throw `ProviderError` mapped to 502/504/429 by the error handler — never a
synthesized movie.

## LLM providers (ai-service)

Interface: `src/cinemind_ai/providers.py` (`ChatProvider` protocol).

Implemented:
- `rule-based` — offline, deterministic, NOT an LLM. Default for tests/dev.
- `openai`, `groq`, `mistral`, `gemini` — real chat + tool calling via the
  **OpenAI-compatible protocol** (`OpenAiCompatProvider` in
  `providers_compat.py`). All four speak the same wire protocol, so one client
  implementation serves them; only base URL, key, and model differ.

Config: `LLM_PROVIDER` selects the implementation. A provider refuses to start
without its own key.
- `openai` → `https://api.openai.com/v1` (paid)
- `groq` → `https://api.groq.com/openai/v1` (free) — console.groq.com
- `mistral` → `https://api.mistral.ai/v1` (free tier) — console.mistral.ai
- `gemini` → `https://generativelanguage.googleapis.com/v1beta/openai` (free tier) — aistudio.google.com

Free-tier model defaults live in `config.py` and are overridable per provider
(`GROQ_MODEL`, `MISTRAL_MODEL`, `GEMINI_MODEL`). Check each console for the
current free model list.

To add a provider:

1. Add a row to `_compat_spec()` in `providers.py` (base URL + key + default
   model) if it is OpenAI-compatible.
2. Or implement the `ChatProvider` protocol directly for non-compatible APIs
   (e.g. Anthropic), returning `ProviderResult`.
3. Keep tool-calling bounded (max loop; see `providers_compat.py`).
4. Add the SDK under `[project.optional-dependencies]` if needed.

A provider must never emit facts on its own: the only fact path is a `ToolResult`
whose facts carry provenance from the structured backend.

## Tools (ai-service)

Tools live in `src/cinemind_ai/tools.py`. A tool declares a pydantic argument
schema and returns `ToolResult(facts=..., ok=..., error_code=...)`. The LLM may
only call tools in the registry; there is no free-form document access.

## Observability

- Backend: pino, per-request id, redacted secrets, bounded log fields.
- AI service: structured summaries with provider, tools, duration, error codes,
  confidence. Persist to `agent_runs` / `agent_tool_calls` (service-role)
  via the backend or a worker; both tables are RLS-closed to clients.

## Testing a new provider

Backend: inject the implementation into `buildApp` (see `app.test.ts`) rather
than mutating globals. AI service: swap `server.registry`/`server.provider` in
tests (see `tests/test_server.py`).