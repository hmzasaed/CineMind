# Provider integration

Every external integration lives behind an interface and is selected by
configuration. Adding a provider never requires touching route code.

## Movie data providers (backend)

Interface: `backend/src/providers/types.ts` (`MovieDataProvider`).

Implemented: `mock` (static facts), `tmdb` (structured API).

Config: `MOVIE_PROVIDER` selects the implementation. Secrets stay in env.

To add a provider (e.g. IMDb or a licensed dataset):

1. Implement `MovieDataProvider` in `providers/`.
2. Parse all responses with a Zod schema; refuse payloads that don't validate.
3. Return `Fact<MovieRecord>` — facts only, never synthesized values.
4. Register it in `providers/index.ts` behind a new env value.
5. Give it a distinct `sourceName` and `sourceKind` (e.g. `api`).

Convention: unknown ids return null (404), provider outages throw and are mapped
to a backend 502 by the caller, never to a synthesized movie.

## LLM providers (ai-service)

Interface: `src/cinemind_ai/providers.py` (`ChatProvider` protocol).

Implemented: `rule-based` (offline, deterministic; dev/tests only), `openai`
(real chat + tool calling).

Config: `LLM_PROVIDER`. A provider may refuse to start without its required key.

To add a provider (e.g. Anthropic):

1. Implement the `ChatProvider` protocol returning `ProviderResult`.
2. Keep tool-calling bounded (max loop; see `providers_openai.py`).
3. Add an extras package dependency under `[project.optional-dependencies]`.
4. Select it in `build_provider`.

A provider must never emit facts on its own: the only fact path is a `ToolResult`
whose facts carry provenance from the structured backend.

## Tools (ai-service)

Tools live in `src/cinemind_ai/tools.py`. A tool declares a pydantic argument
schema and returns `ToolResult(facts=..., ok=..., error_code=...)`. The LLM may
only call tools in the registry; there is no free-form document access.

## Observability

- Backend: pino, per-request id, redacted secrets, bounded log fields.
- AI service: structured summaries with provider, tools, duration, error codes,
  confidence. Persist to `ai_op_logs` (service-role) via the backend or a
  worker; the table is RLS-closed to clients.

## Testing a new provider

Backend: inject the implementation into `buildApp` (see `app.test.ts`) rather
than mutating globals. AI service: swap `server.registry`/`server.provider` in
tests (see `tests/test_server.py`).