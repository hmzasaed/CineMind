import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth-context";
import { useApi, type CurrentUser } from "../lib/api";

export function AccountPage() {
  const { user, accessToken, signOut, refreshSession } = useAuth();
  const api = useApi();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadMe() {
    setError(null);
    try {
      setMe((await api.getMe()).user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void loadMe();
    // Refresh identity only when the access token changes (session refresh).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function onRefresh() {
    setNotice(null);
    try {
      await refreshSession();
      setNotice("Session refreshed.");
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onSignOut() {
    try {
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main>
      <h1>Your account</h1>
      <dl>
        <dt>User id</dt>
        <dd>{user?.id}</dd>
        <dt>Email</dt>
        <dd>{user?.email ?? "—"}</dd>
        <dt>Verified role (from /auth/me)</dt>
        <dd>{me ? (me.role ?? "none") : "(loading)"}</dd>
      </dl>
      {error && <p role="alert" className="prov">Error: {error}</p>}
      {notice && <p role="status" className="prov">{notice}</p>}
      <button type="button" onClick={onRefresh}>Refresh session</button>
      <button type="button" onClick={onSignOut}>Sign out</button>
    </main>
  );
}