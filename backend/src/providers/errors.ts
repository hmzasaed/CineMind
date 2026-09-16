export type ProviderErrorCode =
  | "NOT_FOUND"
  | "INVALID_RESPONSE"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_QUOTA"
  | "UPSTREAM";

/**
 * Normalized provider failure. Every provider adapter converts raw transport /
 * HTTP / schema failures into this shape so callers (routes, ingestion,
 * decorators) can handle them uniformly. Error messages stay bounded and never
 * include full upstream bodies.
 */
export class ProviderError extends Error {
  readonly name = "ProviderError";
  readonly code: ProviderErrorCode;
  readonly provider: string;
  readonly status?: number;
  /** Suggested wait before the next attempt at this provider. */
  readonly retryAfterMs?: number;
  /** 1-based attempt that produced this error. */
  readonly attempt?: number;

  constructor(
    code: ProviderErrorCode,
    message: string,
    provider: string,
    opts: { status?: number; retryAfterMs?: number; attempt?: number; cause?: unknown } = {},
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.code = code;
    this.provider = provider;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    this.attempt = opts.attempt;
  }
}

export function isProviderError(
  error: unknown,
  code?: ProviderErrorCode,
): error is ProviderError {
  if (!(error instanceof ProviderError)) return false;
  return code === undefined || error.code === code;
}

/** Errors worth retrying. Invalid payloads and missing resources never change. */
export function isRetryable(code: ProviderErrorCode): boolean {
  return (
    code === "UPSTREAM" ||
    code === "UPSTREAM_TIMEOUT" ||
    code === "UPSTREAM_UNAVAILABLE" ||
    code === "UPSTREAM_RATE_LIMITED"
  );
}

/** Transient errors qualify for stale-cache fallback. */
export function isTransient(code: ProviderErrorCode): boolean {
  return isRetryable(code) || code === "UPSTREAM_QUOTA";
}

/** Parse Retry-After into milliseconds (HTTP-date or delta-seconds) or undefined. */
export function retryAfterMsFrom(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isNaN(seconds) && seconds >= 0 && Number.isFinite(seconds)) {
    return Math.min(Math.round(seconds * 1000), 60_000);
  }
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return Math.min(Math.max(date.getTime() - Date.now(), 0), 60_000);
  }
  return undefined;
}

export interface ProviderHttpErrorOpts {
  status: number;
  provider: string;
  endpoint: string;
  retryAfterMs?: number;
}

/** Map a non-2xx upstream status into a normalized ProviderError. */
export function providerHttpError(opts: ProviderHttpErrorOpts): ProviderError {
  const { status, provider, endpoint, retryAfterMs } = opts;
  if (status === 404) {
    return new ProviderError("NOT_FOUND", `${provider}: ${endpoint} returned 404`, provider, { status });
  }
  if (status === 429) {
    return new ProviderError(
      "UPSTREAM_RATE_LIMITED",
      `${provider}: ${endpoint} rate limited (429)`,
      provider,
      { status, retryAfterMs: retryAfterMs ?? 5_000 },
    );
  }
  if (status === 401 || status === 403) {
    return new ProviderError(
      "UPSTREAM_QUOTA",
      `${provider}: ${endpoint} denied (${status})`,
      provider,
      { status },
    );
  }
  if (status >= 500) {
    return new ProviderError(
      "UPSTREAM",
      `${provider}: ${endpoint} failed (${status})`,
      provider,
      { status },
    );
  }
  return new ProviderError("UPSTREAM", `${provider}: ${endpoint} failed (${status})`, provider, { status });
}

/** HTTP status + public code used when a ProviderError escapes to the API. */
export function providerHttpStatus(error: ProviderError): { status: number; code: string } {
  switch (error.code) {
    case "NOT_FOUND":
      return { status: 404, code: "PROVIDER_NOT_FOUND" };
    case "INVALID_RESPONSE":
      return { status: 502, code: "PROVIDER_INVALID_RESPONSE" };
    case "UPSTREAM_TIMEOUT":
      return { status: 504, code: "PROVIDER_TIMEOUT" };
    case "UPSTREAM_RATE_LIMITED":
      return { status: 429, code: "PROVIDER_RATE_LIMITED" };
    case "UPSTREAM_QUOTA":
      return { status: 429, code: "PROVIDER_QUOTA_EXCEEDED" };
    case "UPSTREAM_UNAVAILABLE":
    case "UPSTREAM":
    default:
      return { status: 502, code: "PROVIDER_UNAVAILABLE" };
  }
}