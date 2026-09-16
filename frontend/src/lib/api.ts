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

export interface ApiError {
  error?: { code?: string; message?: string };
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export class ApiClient {
  constructor(
    private readonly baseUrl: string = BASE_URL,
    private readonly tokenProvider: (() => string | null) | null = null,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" };
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
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ movieId }),
    });
    await this.parse(res);
  }

  private async parse<T>(res: Response): Promise<T> {
    const body = (await res.json().catch(() => null)) as (T & ApiError) | null;
    if (!res.ok) {
      throw new Error(body?.error?.message ?? `Request failed with ${res.status}`);
    }
    return body as T;
  }
}

export const api = new ApiClient();