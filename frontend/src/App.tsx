import { useState } from "react";
import { api, type Movie, type Provenance } from "./lib/api";

export function App() {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [results, setResults] = useState<{ movies: Movie[]; provenance: Provenance } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      setResults(await api.searchMovies(query, year));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onAdd(movieId: string) {
    setNotice(null);
    setError(null);
    try {
      await api.addToWatchlist(movieId);
      setNotice(`Added ${movieId} to your watchlist`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main>
      <h1>CineMind</h1>
      <p className="prov">
        Movie facts always come from structured sources and are shown with provenance. AI prose is never presented as fact.
      </p>
      <form onSubmit={onSearch}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Movie title"
          aria-label="Movie title"
        />
        <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year (optional)" size={6} aria-label="Year" />
        <button type="submit" disabled={loading || !query.trim()}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p role="alert" className="prov">Error: {error}</p>}
      {notice && <p role="status" className="prov">{notice}</p>}

      {results && (
        <section>
          <p className="prov">
            Results sourced from <strong>{results.provenance.sourceName}</strong>{" "}
            <span className="badge">{results.provenance.sourceKind}</span>{" "}
            <span className="badge">confidence {results.provenance.confidence.toFixed(2)}</span>
          </p>
          <ul>
            {results.movies.map((m) => (
              <li key={m.id}>
                <strong>{m.title}</strong>{" "}
                {m.releaseYear ? `(${m.releaseYear})` : ""}
                {m.rating ? ` — ${m.rating.average.toFixed(1)}★ (${m.rating.votes.toLocaleString()} votes)` : ""}
                <span className="prov"> — {m.genre.join(", ")}</span>
                <button type="button" onClick={() => onAdd(m.id)}>Add to watchlist</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}