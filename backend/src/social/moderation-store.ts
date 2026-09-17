import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../services/supabase.js";
import type { AppConfig } from "../config.js";
import { postgrestError } from "./db-error.js";
import { REVIEW_SELECT, mapReviewRow, type ReviewRow, InMemoryReviewStore } from "./reviews-store.js";
import {
  toPageMeta,
  type ModerationStore,
  type PageMeta,
  type PageRequest,
  type ReportStatus,
  type ReviewDto,
  type ReviewReportDto,
  type ReviewStatus,
  type ReviewStore,
} from "./types.js";

interface ReportRow {
  id: string;
  review_id: string;
  reporter_id: string;
  reason: ReviewReportDto["reason"];
  details: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

function mapReportRow(row: ReportRow): ReviewReportDto {
  return {
    id: String(row.id),
    reviewId: String(row.review_id),
    reporterId: row.reporter_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseModerationStore implements ModerationStore {
  constructor(private readonly admin: SupabaseClient) {}

  async listReports(
    query: PageRequest & { status?: ReportStatus },
  ): Promise<{ reports: ReviewReportDto[]; meta: PageMeta }> {
    let q = this.admin.from("review_reports").select("*", { count: "exact" });
    if (query.status) q = q.eq("status", query.status);
    const from = (query.page - 1) * query.pageSize;
    const { data, error, count } = await q
      .order("created_at", { ascending: false })
      .range(from, from + query.pageSize - 1);
    if (error) throw postgrestError("moderation.listReports", error);
    const reports = (data ?? []).map(mapReportRow);
    return { reports, meta: toPageMeta(query, count ?? reports.length) };
  }

  async resolveReport(id: string, status: "resolved" | "dismissed"): Promise<ReviewReportDto | null> {
    const { data, error } = await this.admin
      .from("review_reports")
      .update({ status })
      .eq("id", id)
      .select("*");
    if (error) throw postgrestError("moderation.resolveReport", error);
    const row = (data ?? [])[0];
    return row ? mapReportRow(row) : null;
  }

  async setReviewStatus(reviewId: string, status: ReviewStatus): Promise<ReviewDto | null> {
    const { data, error } = await this.admin
      .from("reviews")
      .update({ status })
      .eq("id", reviewId)
      .select(`${REVIEW_SELECT}, movies(provider_id)`);
    if (error) throw postgrestError("moderation.setReviewStatus", error);
    const row = (data ?? [])[0] as unknown as (ReviewRow & { movies?: { provider_id: string } | null }) | undefined;
    return row ? mapReviewRow(row, row.movies?.provider_id ?? "", null) : null;
  }
}

/** Shares state with an InMemoryReviewStore instance so reports/status stay consistent in tests. */
export class InMemoryModerationStore implements ModerationStore {
  constructor(private readonly reviewStore: InMemoryReviewStore) {}

  async listReports(
    query: PageRequest & { status?: ReportStatus },
  ): Promise<{ reports: ReviewReportDto[]; meta: PageMeta }> {
    let reports = this.reviewStore.__allReports();
    if (query.status) reports = reports.filter((r) => r.status === query.status);
    reports = [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = reports.length;
    const start = (query.page - 1) * query.pageSize;
    return { reports: reports.slice(start, start + query.pageSize), meta: toPageMeta(query, total) };
  }

  async resolveReport(id: string, status: "resolved" | "dismissed"): Promise<ReviewReportDto | null> {
    return this.reviewStore.__setReportStatus(id, status);
  }

  async setReviewStatus(reviewId: string, status: ReviewStatus): Promise<ReviewDto | null> {
    return this.reviewStore.__setReviewStatus(reviewId, status);
  }
}

export function createModerationStore(config: AppConfig, reviewStore: ReviewStore): ModerationStore {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    return new SupabaseModerationStore(
      createSupabaseAdminClient(config.supabaseUrl, config.supabaseServiceRoleKey),
    );
  }
  if (reviewStore instanceof InMemoryReviewStore) {
    return new InMemoryModerationStore(reviewStore);
  }
  throw new Error("createModerationStore: in-memory fallback requires an InMemoryReviewStore instance");
}
