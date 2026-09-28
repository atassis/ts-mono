import { describe, expect, test } from "vitest";

import { heatAlpha } from "./heatmap";

describe("heatAlpha", () => {
  test("bounds: never fully transparent or fully opaque", () => {
    expect(heatAlpha(0)).toBeGreaterThan(0);
    expect(heatAlpha(1)).toBeLessThan(1);
  });

  test("monotonically increasing with share", () => {
    expect(heatAlpha(0.25)).toBeLessThan(heatAlpha(0.75));
  });

  test("clamps out-of-range input", () => {
    expect(heatAlpha(-1)).toBe(heatAlpha(0));
    expect(heatAlpha(2)).toBe(heatAlpha(1));
  });
});
