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