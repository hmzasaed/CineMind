import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { errorMessage } from "../lib/format";
import { AuthCard, fieldClass, inputClass, primaryBtnClass } from "../components/AuthCard";

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await resetPassword(email);
      setNotice("If that email exists, a reset link is on its way.");
    } catch (err) {
      setError(errorMessage(err, "Could not send a reset link. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Reset password" subtitle="We'll email you a link to get back in.">
      <form onSubmit={onSubmit} noValidate>
        <label className={fieldClass} htmlFor="forgot-email">
          Email
        </label>
        <input
          id="forgot-email"
          type="email"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

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

        <button type="submit" disabled={busy || !email} className={primaryBtnClass}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-5 text-sm text-slate-500">
        Remembered it?{" "}
        <Link to="/login" className="text-gold-300 underline underline-offset-2 hover:text-gold-200">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
