import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useClientPagination } from "./paged";

afterEach(() => {
  cleanup();
});

const items = Array.from({ length: 25 }, (_, i) => i);

describe("useClientPagination", () => {
  it("slices the first page and reports totals", () => {
    const { result } = renderHook(() => useClientPagination(items, 10));
    expect(result.current.page).toBe(1);
    expect(result.current.pageCount).toBe(3);
    expect(result.current.total).toBe(25);
    expect(result.current.pageItems).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("moves across pages", () => {
    const { result } = renderHook(() => useClientPagination(items, 10));
    act(() => result.current.setPage(2));
    expect(result.current.pageItems).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    act(() => result.current.setPage(3));
    expect(result.current.pageItems).toEqual([20, 21, 22, 23, 24]);
  });

  it("clamps the page when the result set shrinks", () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: number[] }) => useClientPagination(list, 10),
      { initialProps: { list: items } },
    );
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    rerender({ list: items.slice(0, 11) });
    expect(result.current.pageCount).toBe(2);
    expect(result.current.page).toBe(2);
    expect(result.current.pageItems).toEqual([10]);
  });
});