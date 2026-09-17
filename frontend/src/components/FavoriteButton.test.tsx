import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FavoriteButton } from "./FavoriteButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FavoriteButton", () => {
  it("shows the add state and calls onToggle", () => {
    const onToggle = vi.fn();
    render(<FavoriteButton isFavorite={false} onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: /add to favorites/i });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows the favorited state when isFavorite is true", () => {
    render(<FavoriteButton isFavorite onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: /favorited/i });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("disables the button while a mutation is pending", () => {
    render(<FavoriteButton isFavorite={false} disabled onToggle={() => {}} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
