import { useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { RequireAuth, RequireGuest } from "./lib/require-auth";
import { AppShell } from "./components/AppShell";
import { EmptyState } from "./components/States";
import { AccountPage } from "./pages/AccountPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { MoviePage } from "./pages/MoviePage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SearchPage } from "./pages/SearchPage";
import { UpcomingPage } from "./pages/UpcomingPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFoundPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-16">
      <EmptyState
        title="Page not found"
        message="That address doesn’t match anything here."
        action={
          <Link
            to="/"
            className="mt-2 inline-block rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Back to home
          </Link>
        }
      />
    </div>
  );
}

export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="upcoming" element={<UpcomingPage />} />
          <Route path="movies/:id" element={<MoviePage />} />
          <Route
            path="login"
            element={
              <RequireGuest>
                <LoginPage />
              </RequireGuest>
            }
          />
          <Route
            path="register"
            element={
              <RequireGuest>
                <RegisterPage />
              </RequireGuest>
            }
          />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route
            path="account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}