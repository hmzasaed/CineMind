/**
 * Provenance model. The LLM is never an authoritative source of movie facts.
 * Every fact the API returns must be traceable to a structured source.
 */

export type FactSourceKind =
  | "database" // structured DB records (movies, credits, watchlists)
  | "api" // an approved, structured data API (e.g. TMDB)
  | "user_data" // data the user provided
  | "ml_model" // output of a deterministic/ML model (not the LLM)
  | "web_research" // permitted, curated web research by the AI service
  | "static" // bundled reference data in data/
  | "deterministic" // deterministic derived computation (e.g. duration arithmetic)

export interface Provenance {
  /** Stable identifier of the record the fact came from. */
  sourceId: string;
  /** Where the fact originated. */
  sourceKind: FactSourceKind;
  /** Name of the provider/table/model that produced the fact. */
  sourceName: string;
  /** ISO 8601 timestamp when the fact was retrieved/recorded. */
  retrievedAt: string;
  /** 0..1. Confidence that this fact is correct, from the source. */
  confidence: number;
  /** Optional pointer to the specific field/endpoint that yielded the fact. */
  ref?: string;
}

/**
 * A fact bundle. Facts are never silently conflated with generated text;
 * clients render facts and AI prose separately.
 */
export interface Fact<T> {
  value: T;
  provenance: Provenance;
}

export type ConflictStatus = "ok" | "conflict" | "stale";

/**
 * Result of comparing an incoming fact update against the stored record.
 * Conflicts are surfaced to the caller rather than silently overwritten.
 */
export interface ConflictCheck {
  status: ConflictStatus;
  incomingTimestamp: string;
  storedTimestamp: string;
  /** Machine + human readable reason for the status. */
  reason: string;
}

export function isWithinGracePeriod(incoming: string, stored: string, staleMs: number): boolean {
  const diff = new Date(incoming).getTime() - new Date(stored).getTime();
  return !Number.isNaN(diff) && diff >= -staleMs;
}