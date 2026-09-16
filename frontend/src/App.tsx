import { NavLink, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./lib/auth-context";
import { RequireAuth, RequireGuest } from "./lib/require-auth";
import { AccountPage } from "./pages/AccountPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";

function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function onSignOut() {
    await signOut().catch(() => undefined);
    navigate("/", { replace: true });
  }

  return (
    <>
      <header>
        <nav>
          <NavLink to="/">CineMind</NavLink>
          <span className="nav-spacer" />
          {user ? (
            <>
              <NavLink to="/account">Account</NavLink>
              <button type="button" onClick={onSignOut}>Sign out</button>
            </>
          ) : (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <NavLink to="/register">Register</NavLink>
            </>
          )}
        </nav>
      </header>
      <Outlet />
    </>
  );
}

function NotFoundPage() {
  return (
    <main>
      <h1>Not found</h1>
      <p className="prov">That page does not exist.</p>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
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
  );
}