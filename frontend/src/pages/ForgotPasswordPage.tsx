import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Reset password</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        {error && <p role="alert" className="prov">Error: {error}</p>}
        {notice && <p role="status" className="prov">{notice}</p>}
        <button type="submit" disabled={busy || !email}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="prov">
        Remembered it? <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}