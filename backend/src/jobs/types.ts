export type IngestionJobKind = "refresh_movie" | "refresh_upcoming";

export type IngestionJobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface IngestionJob {
  id: string;
  kind: IngestionJobKind;
  provider: string;
  externalId: string;
  status: IngestionJobStatus;
  attempts: number;
  maxAttempts: number;
  payload: Record<string, unknown>;
  lastError?: string;
  scheduledFor: string;
  createdAt: string;
  finishedAt?: string;
}

export interface EnqueueJobInput {
  kind: IngestionJobKind;
  provider: string;
  externalId: string;
  payload?: Record<string, unknown>;
  scheduleFor?: string;
  maxAttempts?: number;
}

export interface JobListOptions {
  limit?: number;
  status?: IngestionJobStatus;
  kind?: IngestionJobKind;
}

/**
 * Database-backed ingestion job interface. Jobs are claimed+processed by a
 * worker entirely outside the HTTP request path; request handlers only enqueue
 * and observe them.
 */
export interface IngestionJobStore {
  readonly kind: "in-memory" | "supabase";
  enqueue(input: EnqueueJobInput): Promise<IngestionJob>;
  /** Claim the next due job (pending → running) or null when empty. */
  claimNext(now?: Date): Promise<IngestionJob | null>;
  complete(id: string): Promise<void>;
  fail(id: string, error: string, opts?: { rescheduleInMs?: number }): Promise<void>;
  get(id: string): Promise<IngestionJob | null>;
  list(options?: JobListOptions): Promise<IngestionJob[]>;
}

export function isIngestionJobKind(value: string): value is IngestionJobKind {
  return value === "refresh_movie" || value === "refresh_upcoming";
}

export function isIngestionJobStatus(value: string): value is IngestionJobStatus {
  return (
    value === "pending" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled"
  );
}