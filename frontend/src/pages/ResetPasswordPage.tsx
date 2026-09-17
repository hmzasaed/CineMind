import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { errorMessage } from "../lib/format";
import { AuthCard, fieldClass, inputClass, primaryBtnClass } from "../components/AuthCard";

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
      setError(errorMessage(err, "Could not update your password. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AuthCard title="Reset password">
        <p role="status" className="text-sm text-slate-400">
          Checking session…
        </p>
      </AuthCard>
    );
  }

  if (!session) {
    return (
      <AuthCard title="Reset password">
        <p className="text-sm text-slate-400">
          This link is invalid or expired.{" "}
          <Link to="/forgot-password" className="text-gold-300 underline underline-offset-2 hover:text-gold-200">
            Request a new reset link
          </Link>
          .
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="At least 8 characters.">
      <form onSubmit={onSubmit} noValidate>
        <label className={fieldClass} htmlFor="reset-password">
          New password
        </label>
        <input
          id="reset-password"
          type="password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || password.length < 8} className={primaryBtnClass}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthCard>
  );
}
