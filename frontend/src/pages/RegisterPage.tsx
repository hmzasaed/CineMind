import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

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
      if (needsEmailConfirmation) {
        setNotice("Check your inbox and confirm the email to activate the account.");
      } else {
        setNotice("Account created — you are signed in.");
      }
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Create an account</h1>
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
        <label>
          Password
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
        {notice && <p role="status" className="prov">{notice}</p>}
        <button type="submit" disabled={busy || !email || password.length < 8}>
          {busy ? "Creating account…" : "Register"}
        </button>
      </form>
      <p className="prov">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}