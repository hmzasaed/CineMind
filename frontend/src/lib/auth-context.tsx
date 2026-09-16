import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface AuthErrorLike {
  message: string;
  status?: number;
}

export interface AuthUserLike {
  id: string;
  email?: string | null;
}

export interface AuthSessionLike {
  access_token: string;
  refresh_token?: string | null;
  user: AuthUserLike | null;
}

/**
 * Narrow, stable surface over the Supabase Auth API. The real client
 * (getAuthClient in ./supabase) satisfies it; tests inject a fake.
 */
export interface AuthClientLike {
  getSession(): Promise<{ data: { session: AuthSessionLike | null }; error: AuthErrorLike | null }>;
  onAuthStateChange(listener: (event: string, session: AuthSessionLike | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signUp(input: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string };
  }): Promise<{
    data: { session: AuthSessionLike | null; user: AuthUserLike | null };
    error: AuthErrorLike | null;
  }>;
  signInWithPassword(input: { email: string; password: string }): Promise<{
    data: { session: AuthSessionLike | null; user: AuthUserLike | null };
    error: AuthErrorLike | null;
  }>;
  signOut(): Promise<{ error: AuthErrorLike | null }>;
  resetPasswordForEmail(email: string, options?: { redirectTo?: string }): Promise<{
    error: AuthErrorLike | null;
  }>;
  setSession(input: {
    access_token: string;
    refresh_token?: string | null;
  }): Promise<{
    data: { session: AuthSessionLike | null };
    error: AuthErrorLike | null;
  }>;
  updateUser(attributes: { password?: string; email?: string }): Promise<{
    data: { user: AuthUserLike | null };
    error: AuthErrorLike | null;
  }>;
  refreshSession(): Promise<{
    data: { session: AuthSessionLike | null };
    error: AuthErrorLike | null;
  }>;
}

export interface AuthContextValue {
  /** Current signed-in profile, or null. */
  user: AuthUserLike | null;
  /** Verified session; null until a session is loaded. */
  session: AuthSessionLike | null;
  /** True only while restoring the initial session on mount. */
  loading: boolean;
  /** Current access token for API calls (null when signed out). */
  accessToken: string | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsEmailConfirmation: boolean }>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  refreshSession(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function fallbackRedirect(path: string): string {
  if (typeof window === "undefined") return `http://localhost:5173${path}`;
  return `${window.location.origin}${path}`;
}

export function AuthProvider({
  client,
  children,
}: {
  client: AuthClientLike;
  children: ReactNode;
}) {
  const [user, setUser] = useState<AuthUserLike | null>(null);
  const [session, setSession] = useState<AuthSessionLike | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void client
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const {
      data: { subscription },
    } = client.onAuthStateChange((_event, next) => {
      if (cancelled) return;
      setSession(next);
      setUser(next?.user ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [client]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await client.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
      }
    },
    [client],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await client.signUp({
        email,
        password,
        options: { emailRedirectTo: fallbackRedirect("/") },
      });
      if (error) throw new Error(error.message);
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        return { needsEmailConfirmation: false };
      }
      // No session implies email confirmation is required.
      return { needsEmailConfirmation: true };
    },
    [client],
  );

  const signOut = useCallback(async () => {
    const { error } = await client.signOut();
    if (error) throw new Error(error.message);
    setSession(null);
    setUser(null);
  }, [client]);

  const resetPassword = useCallback(
    async (email: string) => {
      const { error } = await client.resetPasswordForEmail(email, {
        redirectTo: fallbackRedirect("/reset-password"),
      });
      if (error) throw new Error(error.message);
    },
    [client],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      const { error } = await client.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    [client],
  );

  const refreshSession = useCallback(async () => {
    const { data, error } = await client.refreshSession();
    if (error) throw new Error(error.message);
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
    }
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      accessToken: session?.access_token ?? null,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      refreshSession,
    }),
    [user, session, loading, signIn, signUp, signOut, resetPassword, updatePassword, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within an AuthProvider");
  return value;
}