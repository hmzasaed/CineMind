import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CategoryRatingInput } from "./CategoryRatingInput";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CategoryRatingInput", () => {
  it("is collapsed by default when no categories are set", () => {
    render(<CategoryRatingInput title="Test Movie" categories={[]} onChange={() => {}} />);
    expect(screen.queryByText("Acting")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /add detailed ratings/i }));
    expect(screen.getByText("Acting")).toBeTruthy();
  });

  it("is expanded by default when categories already exist", () => {
    render(
      <CategoryRatingInput
        title="Test Movie"
        categories={[{ category: "story", score: 7 }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Story")).toBeTruthy();
  });

  it("adds a new category score without clobbering existing ones", () => {
    const onChange = vi.fn();
    render(
      <CategoryRatingInput
        title="Test Movie"
        categories={[{ category: "story", score: 7 }]}
        onChange={onChange}
      />,
    );
    const actingStars = screen.getByRole("radiogroup", { name: /acting for test movie/i });
    fireEvent.click(actingStars.querySelectorAll("button")[4]); // 5th star = score 5
    expect(onChange).toHaveBeenCalledWith([
      { category: "story", score: 7 },
      { category: "acting", score: 5 },
    ]);
  });
});
