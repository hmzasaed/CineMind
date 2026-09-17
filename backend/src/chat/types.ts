import type { MovieRecord } from "../providers/types.js";
import type { TokenUsage } from "../services/llm/types.js";

export type SourceKind =
  | "database"
  | "api"
  | "user_data"
  | "ml_model"
  | "web_research"
  | "static"
  | "deterministic";

export interface Provenance {
  sourceId: string;
  sourceKind: SourceKind;
  sourceName: string;
  retrievedAt: string;
  confidence: number;
  ref?: string;
}

export interface TextBlock {
  type: "text";
  content: string;
  format?: "markdown" | "plain";
}

export interface MovieCardBlock {
  type: "movie_card";
  movie: MovieRecord;
  provenance: Provenance;
}

export interface ComparisonTableBlock {
  type: "comparison_table";
  headers: string[];
  rows: Array<Record<string, unknown>>;
  movies: MovieRecord[];
  summary?: string;
}

export interface SourceReferenceBlock {
  type: "source_reference";
  sourceId: string;
  sourceName: string;
  sourceKind: SourceKind | string;
  confidence: number;
  ref?: string;
  retrievedAt: string;
}

export interface RecommendationCardBlock {
  type: "recommendation_card";
  movie: MovieRecord;
  reason: string;
  score?: number;
  provenance: Provenance;
}

export interface PredictionCardBlock {
  type: "prediction_card";
  movieTitle: string;
  metric: string;
  value: string | number;
  confidence: number;
  rationale: string;
  provenance?: Provenance;
}

export type ResponseBlock =
  | TextBlock
  | MovieCardBlock
  | ComparisonTableBlock
  | SourceReferenceBlock
  | RecommendationCardBlock
  | PredictionCardBlock;

export interface ToolCallTrace {
  name: string;
  durationMs: number;
  success: boolean;
  error: string | null;
}

export interface OperationalTrace {
  requestId: string;
  durationMs: number;
  intent: string;
  intentConfidence: number;
  toolsCalled: ToolCallTrace[];
  tokenUsage?: TokenUsage;
  costUsd?: number;
  provider: string;
  model: string;
  status: "success" | "error" | "fallback" | "unsupported";
}

export interface ChatMessageRecord {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  blocks?: ResponseBlock[];
  trace?: OperationalTrace;
  createdAt: string;
}

export interface ConversationRecord {
  id: string;
  userId?: string | null;
  title: string;
  provider: string;
  model: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

export interface ChatRequestPayload {
  message: string;
  conversationId?: string;
  provider?: string;
  model?: string;
}

export interface ChatResponsePayload {
  conversationId: string;
  messageId: string;
  blocks: ResponseBlock[];
  trace: OperationalTrace;
}
