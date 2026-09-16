# CineMind AI

AI-assisted movie intelligence — built so that **the LLM is never the source of
movie facts**. Facts come from structured databases, approved APIs, permitted
web research, user data, deterministic services, or trained ML models. The AI
layer can only *cite* validated facts through typed tools; it can never invent
them.

The stack runs entirely on **free tiers**: Groq, Mistral, or Google Gemini for
the LLM, Supabase for the database, TMDB or bundled static data for movie facts.

---

## Contents

- [Core principles](#core-principles)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quickstart (no API keys, ~5 min)](#quickstart-no-api-keys-5-min)
- [Free LLM providers — get keys](#free-llm-providers--get-keys)
- [Step-by-step setup](#step-by-step-setup)
  - [1. Toolchain](#1-toolchain)
  - [2. Backend](#2-backend)
  - [3. AI service](#3-ai-service)
  - [4. Frontend](#4-frontend)
  - [5. Database (Supabase)](#5-database-supabase)
- [Configuration reference](#configuration-reference)
- [API reference](#api-reference)
- [Implementation guide](#implementation-guide)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Security notes](#security-notes)
- [Project layout](#project-layout)
- [Known limitations & roadmap](#known-limitations--roadmap)

---

## Core principles

1. **Facts have provenance.** Every fact carries `sourceName`, `sourceKind`,
   `sourceId`, `retrievedAt`, and a `confidence` score.
2. **The LLM cites, never asserts.** Providers may only call tools
   (`lookup_movie`) and restate validated tool results. If no tool result backs
   a claim, confidence is `0` and the answer says so.
3. **No RAG, no vector search.** No embeddings, no pgvector, no semantic
   retrieval. The model reads no documents; it only calls structured tools.
4. **Untrusted content is data, not instructions.** `POST /sanitize` strips
   instruction-looking blocks from web pages before anything reaches a model.
5. **No secrets in the browser.** Only `VITE_`-prefixed env vars are public.
6. **No hidden reasoning.** Public responses contain no chain-of-thought; logs
   store only bounded operational summaries.
7. **Providers behind interfaces.** Swap the LLM or the movie-data source via
   config, never by editing route code.

---

## Architecture

```
┌────────────┐   GET /movies, /watchlist    ┌──────────────────┐
│  frontend  │ ───────────────────────────► │     backend      │
│ React/Vite │                              │ Node/Fastify/TS  │
└────────────┘                              └────────┬─────────┘
       (browser, no secrets)                          │ Q: AI service tool-calls
                                                      │    hit structured endpoints
                                             ┌────────▼─────────┐
                                             │   ai-service     │  ┌──────────────┐
                                             │ Python/FastAPI   │─►│ LLM provider  │
                                             │ (provider-config)│  │ groq|mistral │
                                             └────────┬─────────┘  │ |gemini|openai│
                                                      │            └──────────────┘
                                   MOVIE_PROVIDER: mock|tmdb ──┐
                                             ┌──────────────────▼──┐
│   Supabase (facts,   │
                                              │   users, watchlist,  │
                                              │   RLS everywhere)    │
                                             └─────────────────────┘
```

- **Frontend** — React + TypeScript (Vite). Searches movies, shows provenance
  badges, manages a watchlist. Never holds secrets.
- **Backend** — Fastify + TypeScript. Auth (Supabase JWT verification via JWKS
  or a local HS256 verifier), role-aware authorization, Helmet security
  headers, CORS, rate limiting, Zod validation, provenance, conflict handling
  (409 on duplicate watchlist entries), structured request logs.
- **AI service** — FastAPI + Pydantic. Chat endpoint with typed tools, a
  provider interface, sanitization for untrusted web content, bounded
  operational summaries, per-IP rate limiting.
- **Supabase** — Postgres schema with RLS on all 21 tables;
  `agent_runs`/`agent_tool_calls` are readable/writable only by the service
  role.
- **data/** — versioned reference data and seeds (static facts, provenance
  `static`).

---

## Tech stack

| Layer       | Technology                                  | Notes                                    |
| ----------- | ------------------------------------------- | ---------------------------------------- |
| Frontend    | React 18, TypeScript, Vite                  | `frontend/`                              |
| Backend     | Node 20+, Fastify 5, TypeScript, Zod        | `backend/`                               |
| AI service  | Python 3.11+, FastAPI, Pydantic             | `ai-service/python/`                     |
| LLM         | Groq / Mistral / Google Gemini (or OpenAI)  | free tiers, OpenAI-compatible protocol   |
| Database    | Supabase (Postgres) + RLS                   | `supabase/migrations/`                   |
| Package mgr | pnpm workspaces                             | root `pnpm-workspace.yaml`               |
| Tests       | vitest (TS), pytest + ruff (Python)         |                                          |

---

## Prerequisites

| Tool        | Version        | Why                                        | Install guidance               |
| ----------- | -------------- | ------------------------------------------ | ------------------------------ |
| Node.js     | >= 20          | backend + frontend                         | https://nodejs.org             |
| pnpm        | >= 9           | monorepo workspace manager                 | `npm install -g pnpm@9`        |
| Python      | >= 3.11, < 3.14| AI service                                 | https://python.org             |
| Supabase CLI| latest         | only needed for the database step          | `npx supabase` (no global install) |

No paid services are required. Groq, Mistral, and Google all have usable free
tiers; TMDB's API key is free; Supabase has a free plan.

---

## Quickstart (no API keys, ~5 min)

This runs everything with the offline `rule-based` provider and the bundled
static movie facts, so no keys are needed.

```bash
# 1. Install all JS dependencies (backend + frontend)
pnpm install

# 2. Backend (terminal A) — http://localhost:3000
pnpm --filter @cinemind/backend dev

# 3. AI service (terminal B) — http://localhost:8000
cd ai-service/python
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn src.cinemind_ai.server:app --reload

# 4. Frontend (terminal C) — http://localhost:5173
pnpm --filter @cinemind/frontend dev
```

The AI service defaults to `rule-based`, which is offline and deterministic.
To use a real (free) LLM, continue to the next section.

Verify quickly:

```bash
curl http://localhost:3000/health
curl "http://localhost:3000/movies?title=dark"
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u1","messages":[{"role":"user","content":"\"Inception\""}]}'
```

The chat reply must include `cited_facts` with a `provenance` object and no
`reasoning` field.

---

## Free LLM providers — get keys

All three speak the OpenAI-compatible chat protocol, so one client
implementation serves them. Only the provider you pick needs a key.

### Groq (`groq`) — fastest free inference

1. Go to <https://console.groq.com> and sign up (free).
2. **API Keys** → **Create API Key**. Keys look like `gsk_...`.
3. Set:
   ```
   LLM_PROVIDER=groq
   GROQ_API_KEY=<your_gsk_key>
   ```
   Default model: `llama-3.3-70b-versatile` (check the console's model list).

### Mistral (`mistral`) — free "Experiment" plan

1. Go to <https://console.mistral.ai> and sign up (free experiment tier).
2. **API Keys** → create one (`...`).
3. Set:
   ```
   LLM_PROVIDER=mistral
   MISTRAL_API_KEY=<your_key>
   ```
   Default model: `open-mistral-nemo-2407`.

### Google Gemini (`gemini`) — free tier

1. Go to <https://aistudio.google.com/apikey> and create a key (free).
2. Set:
   ```
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=<your_key>
   ```
   Default model: `gemini-2.0-flash`.

### OpenAI (paid, optional)

If you have an OpenAI key you can still use it:

```
LLM_PROVIDER=openai
OPENAI_API_KEY=<your_key>
```

> Model names change; each provider's `*_MODEL` env var overrides the default.
> Always check the provider console for the current free model list before a
> production deployment.

---

## Step-by-step setup

### 1. Toolchain

```bash
node -v          # want v20+
npm install -g pnpm@9
python --version # want 3.11/3.12
```

### 2. Backend

```bash
pnpm install                              # installs frontend + backend deps
cd backend
Copy-Item .env.example .env               # Windows PowerShell
cp .env.example .env                       # Linux/macOS
pnpm --filter @cinemind/backend dev       # http://localhost:3000
```

Key settings (see [Configuration reference](#configuration-reference)):

| Var            | Default | Purpose                                  |
| -------------- | ------- | ---------------------------------------- |
| `MOVIE_PROVIDER`| `mock` | `mock` (bundled facts) or `tmdb`        |
| `TMDB_API_KEY` | —       | required only for `tmdb` (free)          |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | — | production Auth: backend verifies Supabase JWTs via JWKS and resolves roles with the admin client |
| `JWT_SECRET`   | —       | local dev/tests fallback verifier (>= 24 chars) |

Get a free TMDB key at <https://developer.themoviedb.org> if you want a real
catalog. Watchlist, `/auth/me`, and `/admin/ping` require a Supabase access
token (or an HS256 token you sign for local dev/testing).

### 3. AI service

```bash
cd ai-service/python
python -m venv .venv
.\.venv\Scripts\activate          # Windows
# source .venv/bin/activate       # Linux/macOS
pip install -e ".[dev]"

Copy-Item .env.example .env       # then edit it
# Windows PowerShell
cp .env.example .env

uvicorn src.cinemind_ai.server:app --reload   # http://localhost:8000
```

To enable a free LLM, edit `ai-service/python/.env`:

```env
LLM_PROVIDER=groq
GROQ_API_KEY=<your_key>
# or LLM_PROVIDER=mistral  + MISTRAL_API_KEY
# or LLM_PROVIDER=gemini   + GEMINI_API_KEY
CINEMIND_BACKEND_BASE_URL=http://localhost:3000
```

Check which provider is active:

```bash
curl http://localhost:8000/health        # -> {"provider": "groq", ...}
```

### 4. Frontend

```bash
cd frontend
Copy-Item .env.example .env              # VITE_API_BASE_URL=http://localhost:3000
pnpm --filter @cinemind/frontend dev     # http://localhost:5173
```

Search "dark knight", verify the result shows `source`, `sourceKind`, and
`confidence`. To use the auth flows, set `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY` in `frontend/.env`: sign up, confirm, then
watchlist actions work end-to-end through `/auth/me`-verified sessions.

### 5. Database (Supabase)

Free Supabase setup (<https://supabase.com>):

```bash
cd supabase
npx supabase login
npx supabase init
npx supabase link --project-ref <your-project-ref>
npx supabase db push                     # applies migrations/00001_initial_schema.sql
```

The migration creates:

- `profiles` — user rows; RLS says users manage only their own row.
- `movies` — structured facts, written only by server pipelines (service
  role); public reads, no client writes.
- `watchlists` — user-owned rows; DB primary key `(user_id, movie_id)`
  enforces uniqueness, so duplicate adds are rejected.
- `agent_runs` / `agent_tool_calls` — AI observability; RLS-closed to clients,
  service role only. Full table reference in `docs/database.md`.

> The backend currently ships an in-memory watchlist store for dev. Wiring the
> Supabase store into `WatchlistStore` is on the roadmap.

---

## Configuration reference

| Variable                        | Where        | Default                 | Purpose                                    |
| ------------------------------- | ------------ | ----------------------- | ------------------------------------------ |
| `BACKEND_PORT`                  | backend      | `3000`                  | HTTP port                                  |
| `BACKEND_LOG_LEVEL`             | backend      | `info`                  | pino log level                             |
| `RATE_LIMIT_MAX_REQUESTS`       | backend      | `100`                   | per-client rate limit                      |
| `RATE_LIMIT_WINDOW_MS`          | backend      | `60000`                 | rate limit window                          |
| `CORS_ORIGIN`                   | backend      | `*`                     | allowed origins (`*` or comma-separated)   |
| `SUPABASE_URL`                  | backend+fe   | —                       | project URL; backend verifies JWTs via JWKS |
| `SUPABASE_SERVICE_ROLE_KEY`     | backend      | —                       | typed admin client (never sent to browser) |
| `SUPABASE_ANON_KEY`             | backend      | —                       | documented for parity; browser uses `VITE_` copy |
| `JWT_SECRET`                    | backend      | —                       | local-dev/tests HS256 verifier (>= 24 chars) |
| `MOVIE_PROVIDER`                | backend      | `mock`                  | `mock` or `tmdb`                           |
| `TMDB_API_KEY`                  | backend      | —                       | free TMDB key (only for `tmdb`)            |
| `AI_SERVICE_PORT`               | ai-service   | `8000`                  | HTTP port (uvicorn flag may override)      |
| `AI_SERVICE_LOG_LEVEL`          | ai-service   | `info`                  | log level                                  |
| `AI_SERVICE_RATE_LIMIT`         | ai-service   | `30/minute`             | per-IP rate limit                          |
| `LLM_PROVIDER`                  | ai-service   | `rule-based`            | `rule-based/`openai`/`groq`/`mistral`/`gemini` |
| `CINEMIND_BACKEND_BASE_URL`     | ai-service   | `http://localhost:3000` | tool fact lookups                          |
| `GROQ_API_KEY` / `GROQ_MODEL`   | ai-service   | — / `llama-3.3-70b-versatile` | Groq free tier |
| `MISTRAL_API_KEY` / `MISTRAL_MODEL` | ai-service | — / `open-mistral-nemo-2407` | Mistral free tier |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | ai-service | — / `gemini-2.0-flash` | Google free tier |
| `OPENAI_API_KEY` / `OPENAI_MODEL`| ai-service   | — / `gpt-4o-mini`       | paid alternative                           |
| `VITE_API_BASE_URL`             | frontend     | `http://localhost:3000` | backend base URL (public)                  |
| `VITE_SUPABASE_URL`             | frontend     | —                       | public Supabase project URL (browser)      |
| `VITE_SUPABASE_ANON_KEY`        | frontend     | —                       | public Supabase anon key (browser)         |

---

## API reference

### Backend (port 3000)

| Method | Path                   | Auth  | Description                                             |
| ------ | ---------------------- | ----- | ------------------------------------------------------- |
| GET    | `/health`              | none  | liveness                                               |
| GET    | `/movies/:id`          | none  | one movie + provenance                                 |
| GET    | `/movies?title=&year=` | none  | search + provenance                                    |
| GET    | `/auth/me`             | JWT   | verified identity + resolved app role                  |
| GET    | `/admin/ping`          | JWT+admin | role-aware test endpoint (admin only)              |
| GET    | `/watchlist`           | JWT   | list my saved movies                                   |
| POST   | `/watchlist`           | JWT   | add movie; 409 if already present                      |
| DELETE | `/watchlist/:movieId`  | JWT   | remove movie                                           |

Auth column: `JWT` = a verified Supabase access token (`Bearer`).
`JWT+admin` additionally requires `role = admin` on `public.profiles`.

### AI service (port 8000)

| Method | Path        | Description                                                                 |
| ------ | ----------- | --------------------------------------------------------------------------- |
| GET    | `/health`   | service + active provider name                                              |
| POST   | `/chat`     | bounded conversation; tools behind registry; returns facts + summary         |
| POST   | `/sanitize` | take untrusted web text, drop instruction blocks, return bounded excerpts    |

#### `POST /chat` example

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id":"u1","messages":[{"role":"user","content":"What year was \"Inception\" released?"}]}'
```

Response shape (abridged):

```json
{
  "request_id": "...",
  "reply": {
    "role": "assistant",
    "content": "Facts retrieved from the structured data source:\n- Inception (2010) ...",
    "cited_facts": [
      { "value": { "id": "tt1375666", "title": "Inception", "releaseYear": 2010 },
        "provenance": { "source_kind": "api", "source_name": "cinemind-backend",
                        "source_id": "...", "confidence": 0.9 } }
    ]
  },
  "provider": "rule-based",
  "tool_calls": [{ "name": "lookup_movie", "arguments": { "title": "Inception" } }],
  "summary": { "facts_cited": 1, "confidence": 0.9 }
}
```

There is no `reasoning`/chain-of-thought key anywhere in the response.

---

## Implementation guide

This is a map of the codebase to the guardrails it enforces. Each concern has
one home, so changes stay small and localized.

### Fact provenance (the core rule)

- `backend/src/types.ts` — `Provenance` + `Fact<T>`: the shapes every fact
  must satisfy. `sourceKind` is an enum with no "llm" value.
- `backend/src/providers/tmdb.ts` — provider fetches facts, decodes them with a
  Zod schema, and attaches provenance. Payloads that fail validation are
  rejected, never silently corrected.
- `backend/src/providers/mock.ts` — deterministic static facts for dev/tests
  (sourceKind `static`). Explicitly `NOT an LLM` and not for production.
- `ai-service/python/src/cinemind_ai/models.py` — the same model on the Python
  side: `Provenance`, `Fact`, `SourceKind` (no llm source).
- `ai-service/python/src/cinemind_ai/tools.py` — the **only** way facts enter a
  chat reply: tools call the structured backend and return `Fact`s re-stamped
  with the provenance received.

### LLM can't invent facts

- `providers_compat.py` — system instruction: must call `lookup_movie`; if no
  tool backs a claim, say so. Tool loop is bounded (max 4 rounds).
- `providers_rules.py` — offline provider (tests/dev) that only echoes tool
  results; it cannot hallucinate because it has no generative model.
- `server.py` — `confidence` is computed from cited facts; **zero cited facts
  ⇒ confidence 0.0**.

### Untrusted content isolation

- `ai-service/python/src/cinemind_ai/sanitize.py` — `extract_facts_from_text`
  strips `<instructions>/<system>/<script>/<style>` blocks and directive-like
  lines before any model input. Bounded excerpt length.

### Security & validation

- `backend/src/routes/*` + `backend/src/auth/middleware.ts` — every payload
  goes through a Zod schema; protected routes require a verified Bearer token
  and resolve the app role from `profiles` for admin checks.
- `backend/src/auth/verifier.ts` — `HmacJwtVerifier` (local HS256) and
  `SupabaseJwtVerifier` (JWKS, key set cached); expired/forged/anon/service
  tokens → 401.
- `backend/src/services/supabase.ts` — the only place the service-role key
  lives; typed admin client. It never reaches the browser bundle.
- `backend/src/middleware/error-handler.ts` — central error mapper; 429/4xx
  and unknown errors are returned generically, never raw internals.
- `backend/src/config.ts` — env validated at startup; invalid config fails
  fast.
- `supabase/migrations/00001_initial_schema.sql` — RLS on every table;
  `agent_runs`/`agent_tool_calls` have zero client policies.
- `supabase/migrations/00002_seed_reference_data.sql` — deterministic demo
  fixtures (users, movies, cast, provenance, audit trail).
- `docs/database.md` — table reference, migration replay, `supabase db test`
  instructions.
- `docs/security.md` — secrets policy, treat-web-content-as-data, logging
  bounds.

### Provider interface (free services)

- `ai-service/python/src/cinemind_ai/providers.py` — `_compat_spec` maps
  `LLM_PROVIDER` → `(base_url, key, model)` for groq/mistral/gemini/openai.
  Adding a provider = adding one dictionary row.
- `backend/src/providers/index.ts` — same idea for movie data (`mock`|`tmdb`).
- `docs/providers.md` — how to add new providers and what to test.

### Observability

- `backend/src/middleware/{request-log,error-handler}.ts` — one structured log
  line per request (method, path, status, duration) with secrets redacted, and
  a central error mapper that never leaks internals.
- `ai-service/python/src/cinemind_ai/server.py` — per-request summaries with
  request id, provider, tool names, durations, and confidence. Persisted to
  `agent_runs`/`agent_tool_calls` (service role) in production.

---

## Testing

```bash
# Backend (vitest) — 26 tests
pnpm --filter @cinemind/backend test
pnpm --filter @cinemind/backend typecheck

# Frontend (vitest) — 7 tests
pnpm --filter @cinemind/frontend test
pnpm --filter @cinemind/frontend typecheck

# AI service (pytest + ruff)
cd ai-service/python
.\.venv\Scripts\activate            # or source .venv/bin/activate
pytest tests/ -v
ruff check src/ tests/

# Database (pgTAP, needs a Supabase project / `supabase` CLI +
# Docker with Postgres running)
supabase db test
```

What the tests cover:

- Backend: health, security headers (Helmet), CORS preflight, movie fetch +
  provenance shape, 404 handling, search, unauthenticated access (401, Bearer
  parsing), expired/forged/garbage/anon/service-role tokens (401), `/auth/me`
  identity + role resolution, role-aware admin guard (403/200), watchlist
  ownership scoping across users, add/list/remove, 409 duplicate conflict,
  validation 400s (missing, oversized, malformed JSON), and rate limiting
  (3-budget → 429 with `RATE_LIMIT_EXCEEDED`).
- Frontend: API client sends the bearer token, omits it when signed out,
  parses provenance, surfaces backend error messages and 401s; `RequireAuth`
  renders for signed-in users, redirects guests to login, and waits for the
  session restore instead of flashing the login form.
- AI service: provider name on health, facts-cited response with provenance and
  **no reasoning field**, invalid message shapes → 422, safe behavior with no
  quoted title, and sanitize stripping instruction blocks.
- Database (`supabase/tests/database/cinemind_tests.sql`): all 21 tables exist,
  seed fixture counts, uniqueness violations (23505), RLS ownership rules
  (anon / authenticated / admin / service_role), and column-level grants on
  `profiles.role`. See `docs/database.md`.

---

## Troubleshooting

| Symptom                                          | Likely cause / fix                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `Invalid environment configuration` on backend   | Copy `.env.example` → `.env`; set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, or `JWT_SECRET` (>= 24 chars) for local dev. |
| `LLM_PROVIDER=groq requires an API key`          | Set the matching `GROQ_API_KEY` for the provider in `ai-service/.env`.    |
| `/health` on AI service shows `provider: rule-based` | `LLM_PROVIDER` is unset or invalid; review `.env`.                    |
| Chat reply has no `cited_facts`                  | Backend not running, or facts are `mock` and the quoted title doesn't match; check `CINEMIND_BACKEND_BASE_URL`. |
| Watchlist endpoints return 401                    | A verified Supabase access token is required. Local dev: sign an HS256 token with the same `JWT_SECRET`. |
| Port already in use                               | Change `BACKEND_PORT`/`AI_SERVICE_PORT` or stop the conflicting process.  |
| Tests hang on Windows Puppeteer/uvicorn           | Not applicable — all tests are in-process (vitest inject, pytest client). |
| `pnpm` not recognized                             | `npm install -g pnpm@9`, then reopen your terminal.                       |

---

## Security notes

- **Never** commit `.env` files; `.gitignore` ignores them everywhere.
  `JWT_SECRET`, `*_API_KEY` are server-side only.
- `VITE_*` vars are embedded in the browser bundle and are **public** — never
  put secrets there.
- Loggers redact `authorization`, `cookie`, and key/secret/token fields.
- Web content is handled as data: instruction blocks are stripped by
  `/sanitize`; nothing from an untrusted page is concatenated into a system
  prompt.
- `agent_runs`/`agent_tool_calls` store only bounded operational summaries —
  tool names, timings, error codes, confidence. No prompts, no messages, no
  chain-of-thought.

Full policy: `docs/security.md`.

---

## Project layout

```
CineMind/
├── frontend/                 React + Vite + TS
│   └── src/
│       ├── lib/api.ts        typed API client (bearer token, provenance types)
│       ├── lib/auth-context.tsx  Supabase auth provider (sign in/up, reset, refresh)
│       ├── lib/supabase.ts   anon-key client (browser-safe)
│       ├── lib/require-auth.tsx  protected-route guards
│       └── pages/            home, login, register, reset-password, account
├── backend/                  Fastify + TS
│   └── src/
│       ├── auth/             token verifiers, role middleware, profile store
│       ├── services/         typed Supabase admin client (service-role, server-only)
│       ├── providers/        MovieDataProvider: mock | tmdb (config-selected)
│       ├── middleware/       error handler, request log
│       └── routes/           health, movies, auth, watchlist
├── ai-service/python/        FastAPI + Pydantic
│   └── src/cinemind_ai/
│       ├── providers.py      LLM selector (rule-based|openai|groq|mistral|gemini)
│       ├── providers_compat.py  OpenAI-compatible chat + tool calling
│       ├── providers_rules.py   offline deterministic provider
│       ├── tools.py          typed tools → structured backend facts
│       ├── sanitize.py       untrusted web text → bounded facts, drop instructions
│       └── server.py         /health /chat /sanitize
├── supabase/migrations/      SQL schema + RLS
├── data/                     static reference facts + seeds
└── docs/                     architecture, providers, security
```

---

## Known limitations & roadmap

- **Watchlist store**: the backend ships an in-memory `WatchlistStore` for dev.
  A Supabase-backed store behind the same interface is the next step.
- **Database apply**: `supabase db push` requires a linked project; the SQL is
  not covered by automated tests yet.
- **Live LLM test**: provider calls are covered by interface + offline tests;
  a live-key smoke test is run manually (`curl /health` shows the provider).
- **Root lint/test plumbing**: `pnpm -r lint` aggregation is defined but each
  package runs its own script today.

---

_Architecture, provider, and security details live in `docs/architecture.md`,
`docs/providers.md`, and `docs/security.md`._