import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { errorMessage } from "../lib/format";
import { AuthCard, fieldClass, inputClass, primaryBtnClass } from "../components/AuthCard";

export function RegisterPage() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { needsEmailConfirmation } = await signUp(email, password);
      setNotice(
        needsEmailConfirmation
          ? "Check your inbox and confirm the email to activate the account."
          : "Account created — you are signed in.",
      );
      setPassword("");
    } catch (err) {
      setError(errorMessage(err, "Registration failed. Try a different email or a longer password."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Create an account" subtitle="Save movies, mark them watched, and rate them.">
      <form onSubmit={onSubmit} noValidate>
        <label className={fieldClass} htmlFor="register-email">
          Email
        </label>
        <input
          id="register-email"
          type="email"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <label className={fieldClass + " mt-4"} htmlFor="register-password">
          Password
        </label>
        <input
          id="register-password"
          type="password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="mt-1.5 text-xs text-slate-500">At least 8 characters.</p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-4 rounded-lg border border-gold-400/30 bg-gold-400/10 px-3 py-2 text-sm text-gold-300">
            {notice}
          </p>
        )}

        <button type="submit" disabled={busy || !email || password.length < 8} className={primaryBtnClass}>
          {busy ? "Creating account…" : "Register"}
        </button>
      </form>

      <p className="mt-5 text-sm text-slate-500">
        Already registered?{" "}
        <Link to="/login" className="text-gold-300 underline underline-offset-2 hover:text-gold-200">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}