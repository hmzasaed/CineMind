import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth-context";

/**
 * Protected route wrapper. While the initial session is being restored we show
 * a placeholder instead of redirecting, so a brief flash of the login page
 * never happens for signed-in users.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <p role="status">Checking session…</p>;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

/** Redirect signed-in users away from guest-only pages (login/register). */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Checking session…</p>;
  if (user) return <Navigate to="/account" replace />;
  return <>{children}</>;
}