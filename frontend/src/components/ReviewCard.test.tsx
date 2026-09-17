import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReviewCard } from "./ReviewCard";
import { AuthContext, type AuthContextValue } from "../lib/auth-context";
import type { Review } from "../lib/api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: { id: "viewer-1", email: "viewer@example.com" },
    session: { access_token: "tok", user: { id: "viewer-1" } },
    loading: false,
    accessToken: "tok",
    signIn: async () => undefined,
    signUp: async () => ({ needsEmailConfirmation: true }),
    signOut: async () => undefined,
    resetPassword: async () => undefined,
    updatePassword: async () => undefined,
    refreshSession: async () => undefined,
    ...overrides,
  };
}

function renderCard(review: Review, auth: AuthContextValue = authValue()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </AuthContext.Provider>
  );
  return render(<ReviewCard review={review} currentUserId={auth.user?.id ?? null} />, { wrapper });
}

const SPOILER_BODY = "The twist is that the butler was the murderer all along.";

function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    id: "rev-1",
    movieId: "tt1",
    userId: "author-1",
    title: null,
    body: SPOILER_BODY,
    rating: 8,
    languageCode: "en",
    status: "published",
    hasSpoilers: true,
    likesCount: 0,
    reportCount: 0,
    likedByMe: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ReviewCard spoiler gate", () => {
  it("never puts spoiler text in the DOM before the reader opts in", () => {
    renderCard(makeReview());
    expect(screen.queryByText(SPOILER_BODY)).toBeNull();
    expect(screen.getByText(/contains spoilers/i)).toBeTruthy();
  });

  it("reveals the body only after clicking 'Show anyway'", () => {
    renderCard(makeReview());
    fireEvent.click(screen.getByRole("button", { name: /show anyway/i }));
    expect(screen.getByText(SPOILER_BODY)).toBeTruthy();
  });

  it("renders the body immediately when hasSpoilers is false", () => {
    renderCard(makeReview({ hasSpoilers: false, body: "A perfectly spoiler-free review." }));
    expect(screen.getByText("A perfectly spoiler-free review.")).toBeTruthy();
    expect(screen.queryByText(/contains spoilers/i)).toBeNull();
  });

  it("shows a Report action for another user's review but not for your own", () => {
    renderCard(makeReview({ userId: "author-1" }), authValue({ user: { id: "viewer-1" } }));
    expect(screen.getByRole("button", { name: /report/i })).toBeTruthy();

    cleanup();
    renderCard(makeReview({ userId: "viewer-1" }), authValue({ user: { id: "viewer-1" } }));
    expect(screen.queryByRole("button", { name: /report/i })).toBeNull();
  });
});
