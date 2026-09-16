import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

/**
 * Password-recovery landing page. Supabase redirects here with a recovery
 * hash; detectSessionInUrl (in ./supabase) exchanges it for a session, which
 * is reflected through useAuth as session present but user unconfirmed. A new
 * password here completes the reset.
 */
export function ResetPasswordPage() {
  const { session, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await updatePassword(password);
      navigate("/account", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main><p role="status">Checking session…</p></main>;

  if (!session) {
    return (
      <main>
        <h1>Reset password</h1>
        <p className="prov">
          This link is invalid or expired. <Link to="/forgot-password">Request a new reset link</Link>.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Choose a new password</h1>
      <form onSubmit={onSubmit}>
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {error && <p role="alert" className="prov">Error: {error}</p>}
        <button type="submit" disabled={busy || password.length < 8}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </main>
  );
}