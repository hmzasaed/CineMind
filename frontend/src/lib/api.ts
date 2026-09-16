import { useMemo } from "react";
import { useAuth } from "./auth-context";

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

export interface Movie {
  id: string;
  title: string;
  releaseYear?: number;
  runtimeMinutes?: number;
  overview?: string;
  genre: string[];
  rating?: { average: number; votes: number };
}

export interface SearchResponse {
  movies: Movie[];
  provenance: Provenance;
}

export interface CurrentUser {
  id: string;
  email: string | null;
  role: "user" | "admin" | null;
  authRole: string;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    retryAfter?: string;
  };
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

function messageFor(res: Response, body: ApiErrorBody | null): string {
  if (body?.error?.message) return body.error.message;
  return `Request failed with ${res.status}`;
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string = BASE_URL,
    private readonly tokenProvider: (() => string | null) | null = null,
  ) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json", ...extra };
    const token = this.tokenProvider?.();
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  async searchMovies(title: string, year?: string): Promise<SearchResponse> {
    if (!title.trim()) throw new Error("title is required");
    const params = new URLSearchParams({ title });
    if (year) params.set("year", year);
    const res = await fetch(`${this.baseUrl}/movies?${params}`, { headers: this.headers() });
    return this.parse<SearchResponse>(res);
  }

  async addToWatchlist(movieId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/watchlist`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ movieId }),
    });
    await this.parse(res);
  }

  async getMe(): Promise<{ user: CurrentUser }> {
    const res = await fetch(`${this.baseUrl}/auth/me`, { headers: this.headers() });
    return this.parse<{ user: CurrentUser }>(res);
  }

  private async parse<T>(res: Response): Promise<T> {
    const body = (await res.json().catch(() => null)) as (T & ApiErrorBody) | null;
    if (!res.ok) {
      throw new Error(messageFor(res, body));
    }
    return body as T;
  }
}

/** ApiClient wired to the current Supabase session access token. */
export function useApi(): ApiClient {
  const { accessToken } = useAuth();
  return useMemo(
    () => new ApiClient(undefined, () => accessToken),
    // The client is cheap to rebuild and must capture the freshest token,
    // e.g. right after an automatic session refresh.
    [accessToken],
  );
}