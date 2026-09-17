import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config.js";
import { createSupabaseAdminClient } from "../services/supabase.js";
import {
  isIngestionJobKind,
  isIngestionJobStatus,
  type EnqueueJobInput,
  type IngestionJob,
  type IngestionJobStatus,
  type IngestionJobStore,
  type JobListOptions,
} from "./types.js";

interface JobRow {
  id: string;
  kind: string;
  provider: string;
  external_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
  last_error: string | null;
  scheduled_for: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

function toJob(row: JobRow, overrides: Partial<IngestionJob> = {}): IngestionJob {
  const kind = isIngestionJobKind(row.kind) ? row.kind : "refresh_movie";
  const status = isIngestionJobStatus(row.status) ? row.status : "pending";
  return {
    id: String(row.id),
    kind,
    provider: row.provider,
    externalId: row.external_id,
    status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    payload: row.payload ?? {},
    lastError: row.last_error ?? undefined,
    scheduledFor: row.scheduled_for,
    createdAt: row.created_at,
    finishedAt: row.finished_at ?? undefined,
    ...overrides,
  };
}

function postgrestError(context: string, error: { message: string }): Error {
  return new Error(`${context}: ${String(error.message)}`);
}

export class SupabaseIngestionJobStore implements IngestionJobStore {
  readonly kind = "supabase" as const;

  constructor(private readonly admin: SupabaseClient) {}

  async enqueue(input: EnqueueJobInput): Promise<IngestionJob> {
    const { data, error } = await this.admin
      .from("ingestion_jobs")
      .insert({
        kind: input.kind,
        provider: input.provider,
        external_id: input.externalId,
        status: "pending",
        attempts: 0,
        max_attempts: input.maxAttempts ?? 3,
        payload: input.payload ?? {},
        scheduled_for: input.scheduleFor ?? new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw postgrestError("jobs.enqueue", error);
    return toJob(data as unknown as JobRow);
  }

  async claimNext(now = new Date()): Promise<IngestionJob | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: row, error: readError } = await this.admin
        .from("ingestion_jobs")
        .select("*")
        .eq("status", "pending")
        .lte("scheduled_for", now.toISOString())
        .order("scheduled_for", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (readError) throw postgrestError("jobs.claim", readError);
      if (!row) return null;
      const { error: updateError } = await this.admin
        .from("ingestion_jobs")
        .update({
          status: "running",
          started_at: now.toISOString(),
          attempts: (row.attempts as number) + 1,
          last_error: null,
        })
        .eq("id", row.id)
        .eq("status", "pending");
      if (!updateError) return toJob(row as unknown as JobRow, { status: "running", attempts: row.attempts + 1 });
    }
    return null;
  }

  async complete(id: string): Promise<void> {
    const { error } = await this.admin
      .from("ingestion_jobs")
      .update({ status: "succeeded", finished_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw postgrestError("jobs.complete", error);
  }

  async fail(id: string, message: string, opts: { rescheduleInMs?: number } = {}): Promise<void> {
    const { data: row, error: readError } = await this.admin
      .from("ingestion_jobs")
      .select("attempts, max_attempts")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw postgrestError("jobs.fail", readError);
    const attempts = row?.attempts ?? 0;
    const maxAttempts = row?.max_attempts ?? 3;
    if (attempts >= maxAttempts) {
      const { error } = await this.admin
        .from("ingestion_jobs")
        .update({ status: "failed", finished_at: new Date().toISOString(), last_error: message.slice(0, 2000) })
        .eq("id", id)
        .eq("status", "running");
      if (error) throw postgrestError("jobs.failExhausted", error);
      return;
    }
    const rescheduleInMs = opts.rescheduleInMs ?? 60_000;
    const { error } = await this.admin
      .from("ingestion_jobs")
      .update({
        status: "pending",
        scheduled_for: new Date(Date.now() + rescheduleInMs).toISOString(),
        last_error: message.slice(0, 2000),
        started_at: null,
        finished_at: null,
      })
      .eq("id", id)
      .eq("status", "running");
    if (error) throw postgrestError("jobs.retry", error);
  }

  async get(id: string): Promise<IngestionJob | null> {
    const { data, error } = await this.admin.from("ingestion_jobs").select("*").eq("id", id).maybeSingle();
    if (error) throw postgrestError("jobs.get", error);
    return data ? toJob(data as unknown as JobRow) : null;
  }

  async list(options: JobListOptions = {}): Promise<IngestionJob[]> {
    let query = this.admin
      .from("ingestion_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(options.limit ?? 50);
    if (options.status) query = query.eq("status", options.status);
    if (options.kind) query = query.eq("kind", options.kind);
    const { data, error } = await query;
    if (error) throw postgrestError("jobs.list", error);
    return (data ?? []).map((row) => toJob(row as unknown as JobRow));
  }
}

export class InMemoryIngestionJobStore implements IngestionJobStore {
  readonly kind = "in-memory" as const;
  private readonly jobs = new Map<string, IngestionJob>();
  private nextId = 0;

  async enqueue(input: EnqueueJobInput): Promise<IngestionJob> {
    const now = new Date().toISOString();
    const job: IngestionJob = {
      id: `job-${++this.nextId}`,
      kind: input.kind,
      provider: input.provider,
      externalId: input.externalId,
      status: "pending",
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      payload: input.payload ?? {},
      scheduledFor: input.scheduleFor ?? now,
      createdAt: now,
    };
    this.jobs.set(job.id, job);
    return { ...job };
  }

  async claimNext(now = new Date()): Promise<IngestionJob | null> {
    const due = [...this.jobs.values()]
      .filter((j) => j.status === "pending" && new Date(j.scheduledFor).getTime() <= now.getTime())
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0];
    if (!due) return null;
    const claimed: IngestionJob = { ...due, status: "running", attempts: due.attempts + 1, lastError: undefined };
    this.jobs.set(due.id, claimed);
    return { ...claimed };
  }

  async complete(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.set(id, { ...job, status: "succeeded", finishedAt: new Date().toISOString() });
  }

  async fail(id: string, message: string, opts: { rescheduleInMs?: number } = {}): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    const attempts = job.attempts;
    if (attempts >= job.maxAttempts) {
      this.jobs.set(id, { ...job, status: "failed", finishedAt: new Date().toISOString(), lastError: message });
      return;
    }
    this.jobs.set(id, {
      ...job,
      status: "pending",
      lastError: message,
      scheduledFor: new Date(Date.now() + (opts.rescheduleInMs ?? 60_000)).toISOString(),
    });
  }

  async get(id: string): Promise<IngestionJob | null> {
    const job = this.jobs.get(id);
    return job ? { ...job } : null;
  }

  async list(options: JobListOptions = {}): Promise<IngestionJob[]> {
    let jobs = [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (options.status) jobs = jobs.filter((j) => j.status === options.status);
    if (options.kind) jobs = jobs.filter((j) => j.kind === options.kind);
    return jobs.slice(0, options.limit ?? 50).map((j) => ({ ...j }));
  }

  /** Test helper: all stored jobs with their live state. */
  snapshot(): IngestionJob[] {
    return [...this.jobs.values()];
  }
}

export function createIngestionJobStore(config: AppConfig): IngestionJobStore {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    return new SupabaseIngestionJobStore(
      createSupabaseAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey),
    );
  }
  return new InMemoryIngestionJobStore();
}

export type { IngestionJobStatus };

export type { EnqueueJobInput, IngestionJob, IngestionJobStore, JobListOptions } from "./types.js";