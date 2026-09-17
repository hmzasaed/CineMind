import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { errorMessage } from "../lib/format";
import { AuthCard, fieldClass, inputClass, primaryBtnClass } from "../components/AuthCard";

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/account";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Sign-in failed. Check your email and password."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Your profile, watchlist, and ratings.">
      <form onSubmit={onSubmit} noValidate>
        <label className={fieldClass} htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <label className={fieldClass + " mt-4"} htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || !email || !password} className={primaryBtnClass}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-sm text-slate-500">
        No account?{" "}
        <Link to="/register" className="text-gold-300 underline underline-offset-2 hover:text-gold-200">
          Register
        </Link>{" "}
        ·{" "}
        <Link to="/forgot-password" className="text-gold-300 underline underline-offset-2 hover:text-gold-200">
          Forgot password?
        </Link>
      </p>
    </AuthCard>
  );
}