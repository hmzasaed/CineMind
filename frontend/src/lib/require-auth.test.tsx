import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./require-auth";
import { AuthContext, type AuthContextValue } from "./auth-context";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  const base: AuthContextValue = {
    user: null,
    session: null,
    loading: false,
    accessToken: null,
    signIn: async () => undefined,
    signUp: async () => ({ needsEmailConfirmation: true }),
    signOut: async () => undefined,
    resetPassword: async () => undefined,
    updatePassword: async () => undefined,
    refreshSession: async () => undefined,
  };
  return { ...base, ...overrides };
}

function renderRoute(value: AuthContextValue) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={["/account"]}>
        <Routes>
          <Route
            path="/account"
            element={
              <RequireAuth>
                <div>private content</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("RequireAuth", () => {
  it("renders protected content for signed-in users", () => {
    renderRoute(makeValue({ user: { id: "u1", email: "a@b.co" }, loading: false }));
    expect(screen.getByText("private content")).toBeTruthy();
    expect(screen.queryByText("login page")).toBeNull();
  });

  it("redirects guests to login", () => {
    renderRoute(makeValue({ user: null, loading: false }));
    expect(screen.queryByText("private content")).toBeNull();
    expect(screen.getByText("login page")).toBeTruthy();
  });

  it("waits for the session load instead of flashing the login form", () => {
    renderRoute(makeValue({ user: null, loading: true }));
    expect(screen.getByText(/checking session/i)).toBeTruthy();
    expect(screen.queryByText("login page")).toBeNull();
  });
});