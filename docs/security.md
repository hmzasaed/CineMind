# Security model

## Secret partitioning

- The **browser** only ever holds `VITE_*` vars: Supabase project URL + anon
  key, backend base URL. `VITE_`-prefixed env vars are the only ones the
  browser bundle sees. Backend and AI-service secrets (`SUPABASE_SERVICE_ROLE_KEY`,
  `*_API_KEY`) are server-side only.
- The **service-role key lives in one file**: `backend/src/services/supabase.ts`
  builds a typed admin client (`createSupabaseAdminService`). Route code depends
  on narrow interfaces, the key never enters the request path, and provider API
  keys (TMDB, LLM) are never proxied through the frontend.
- `.env` files are gitignored. `.env.example` files document required values
  without values.
- Loggers redact authorization headers and any key/secret/token fields.
- The AI service never returns raw provider keys, and chat summaries never
  include prompts or tool arguments.

## Auth

The frontend talks to Supabase Auth directly with the anon key (register, sign
in, password reset, session refresh are handled by `@supabase/supabase-js`).
The backend never signs tokens; it **verifies** them:

- `backend/src/auth/verifier.ts` — `SupabaseJwtVerifier` validates access
  tokens against the project JWKS endpoint (cached keyset) with
  `aud = authenticated`; expired, forged, anon-audience, and service-role
  tokens all fail closed to 401. `HmacJwtVerifier` is the local-dev/test
  fallback (HS256 + `JWT_SECRET`).
- `backend/src/auth/middleware.ts` — `requireAuth` attaches `req.auth`
  (`userId`, `email`, `authRole`); `requireAppRole` resolves the application
  role from `public.profiles` via the admin client, so a token alone never
  grants admin. Missing/unknown profile ⇒ role `null`.
- Errors are uniform: `401 UNAUTHORIZED` (with `WWW-Authenticate`), `403
  FORBIDDEN`, `400/422` on invalid input, `429 RATE_LIMIT_EXCEEDED`.

## Data validity

- Every inbound payload is schema-validated (Zod on the backend, pydantic on
  the AI service) before touching any logic or store.
- Every fact carries `provenance`: `sourceId`, `sourceKind`, `sourceName`,
  `retrievedAt`, `confidence`. Confidence comes from the source; a response
  with zero cited facts has confidence `0.0`.
- Duplicate user writes (e.g. adding a movie twice) surface as 409 conflicts
  instead of silent overwrite.

## Trusting untrusted content

Web content is data, not instructions:

- `ai-service POST /sanitize` strips `<instructions>/<system>/<script>/<style>`
  blocks and directive-looking lines before returning bounded excerpts. The
  excerpt is limited in length; nothing from an untrusted page is concatenated
  into a system prompt except through this filter.
- The system prompt that reaches the LLM is assembled from trusted environment
  configuration only.

## Authorization and abuse

- Protected routes require a verified Supabase access token; ownership is
  enforced per row by Supabase RLS using `auth.uid()` (and per-user in the
  backend's watchlist store, which keys all data by the verified `userId`).
- `/admin/ping` is an admin-only test endpoint: pair `requireAuth` with
  `requireAppRole(profileStore, "admin")`, resolved from `profiles.role`.
- `movies` is read-only for clients; writes require service-role.
- `agent_runs` and `agent_tool_calls` deny all client access; only
  service-role pipelines write to them.
- Rate limits: backend per-client (`RATE_LIMIT_MAX_REQUESTS`/window,
  429 with `retryAfter`), AI service per-IP (`AI_SERVICE_RATE_LIMIT`).
- Transport hardening: `@fastify/helmet` sets security headers (HSTS, nosniff,
  frame-ancestors, …) and `@fastify/cors` restricts origins (`CORS_ORIGIN`).

## Operational observability (bounded)

We log only what is needed to debug: request id, method, path, status,
duration, provider, tool names (not arguments), error codes, counts, and
confidence. We never log prompts, messages, full tool inputs, or any reasoning.
The `agent_runs` / `agent_tool_calls` columns enforce that at the schema level.