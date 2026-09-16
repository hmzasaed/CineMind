# Security model

## Secrets

- `VITE_`-prefixed env vars are the only ones the browser bundle sees. Backend
  and AI-service secrets (`JWT_SECRET`, `*_API_KEY`) are server-side only.
- `.env` files are gitignored. `.env.example` files document required values
  without values.
- Loggers redact authorization headers and any key/secret/token fields.
- The AI service never returns raw provider keys, and chat summaries never
  include prompts or tool arguments.

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

- User-owned routes require a valid JWT; ownership is enforced per row by
  Supabase RLS using `auth.uid()`.
- `movies` is read-only for clients; writes require service-role.
- `ai_op_logs` denies all client access; only service-role pipelines write to
  it.
- Rate limits: backend per-client (`RATE_LIMIT_MAX_REQUESTS`/window), AI
  service per-IP (`AI_SERVICE_RATE_LIMIT`).

## Operational observability (bounded)

We log only what is needed to debug: request id, method, path, status,
duration, provider, tool names (not arguments), error codes, counts, and
confidence. We never log prompts, messages, full tool inputs, or any reasoning.
`ai_op_logs` columns enforce that at the schema level.