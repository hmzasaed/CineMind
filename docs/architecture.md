# CineMind Architecture

CineMind is a movie intelligence product. The core rule: **the LLM is never an
authoritative source of movie facts.** Every fact shown or cited must trace to a
structured source: the database, an approved API, permitted web research, user
data, a deterministic service, or a trained ML model.

## Components

```
frontend/   React + TypeScript (Vite). Browser UI. Never holds secrets.
backend/    Node/Fastify + TypeScript. Structured facts API, auth, rate limits.
ai-service/ Python/FastAPI. LLM + tools behind a provider interface.
supabase/   Postgres schema, RLS, migrations. Facts + user data.
data/       Versioned reference data and seeds.
docs/       This documentation.
```

## Trust boundaries

1. **Browser -> backend**: JWT-secured. Backend validates every payload with
   Zod, rate-limits per client, and never returns provider secrets.
2. **Browser -> ai-service**: no direct path for browser traffic by default.
   The frontend talks to the backend; the AI service is backend-facing only.
3. **ai-service -> backend**: tool calls hit structured endpoints
   (`/movies`), parse with pydantic, and re-stamp provenance received from the
   backend. The AI service cannot invent facts because tools are its only
   source.
4. **LLM output**: the provider may only request tool calls and cite
   `Fact` objects. Responses carry `cited_facts`, `confidence`, and a bounded
   operational summary. There is no chain-of-thought field anywhere in the
   public model.
5. **Web content**: `POST /sanitize` isolates instructions (untrusted) from
   factual excerpts before anything reaches a model.

## Guardrails implemented

| Guardrail | Where | Detail |
|---|---|---|
| Schema validation | backend/ai | Zod + pydantic, strict |
| Authorization | backend | JWT verification for user data |
| Rate limiting | backend/ai | per-client and per-IP |
| Provenance | everywhere | source id, kind, name, timestamp, confidence |
| Conflict handling | DB + backend | `movie_sources` conflict ledger; unique keys |
| Observability | backend/ai | bounded structured logs, request ids |
| No secrets to browser | frontend | only `VITE_` env, never keys |
| No chain-of-thought | ai-service | public models have no reasoning field |

## Data flow: "what is the rating of The Dark Knight?"

1. Frontend calls `backend GET /movies?title=The Dark Knight`.
2. Backend routes to the configured provider (mock or tmdb), validates the raw
   response, returns `{ movies, provenance }`.
3. AI service (if used) runs a `lookup_movie` tool against that same endpoint
   and only echoes validated facts into its reply.
4. Facts rendered in the UI always show `sourceName`, `sourceKind`, and
   `confidence`.

## Running locally

Backend:

```bash
pnpm install
pnpm --filter @cinemind/backend dev   # http://localhost:3000
```

AI service (Python 3.11+):

```bash
cd ai-service/python
python -m venv .venv
.venv/Scripts/activate            # Windows
pip install -e ".[dev]"
uvicorn src.cinemind_ai.server:app --reload
```

Frontend:

```bash
pnpm --filter @cinemind/frontend dev
```

Database:

```bash
cd supabase && npx supabase db push
```

Default provider for the backend is `mock` (bundled static facts, provenance
`static`). Set `MOVIE_PROVIDER=tmdb` + `TMDB_API_KEY` for a real catalog.

LLM provider is selected with `LLM_PROVIDER`. Free options: `groq` (Groq),
`mistral` (Mistral), `gemini` (Google). Each needs its own free API key and
uses the OpenAI-compatible protocol. `rule-based` is the offline dev default.
See `ai-service/python/.env.example` and `docs/providers.md`.

## Non-goals (explicitly out of scope)

- RAG, embeddings, pgvector, vector databases, vector search, or semantic
  retrieval. The LLM reads no documents; it can only call tools.
- Using the LLM as a store of movie facts.
- Prompt-based content reaching models without instruction isolation.