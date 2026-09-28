import { describe, expect, test } from "vitest";

import { columnOrderByAccuracy, defaultColumnOrder } from "./gridColumns";

describe("defaultColumnOrder", () => {
  test("identity order", () => {
    expect(defaultColumnOrder(4)).toEqual([0, 1, 2, 3]);
  });
});

describe("columnOrderByAccuracy", () => {
  test("best accuracy first", () => {
    expect(columnOrderByAccuracy([0.5, 0.9, 0.2])).toEqual([1, 0, 2]);
  });

  test("runs with no accuracy sort last, keeping their relative order", () => {
    expect(columnOrderByAccuracy([undefined, 0.5, undefined, 0.9])).toEqual([
      3, 1, 0, 2,
    ]);
  });

  test("ties keep input order", () => {
    expect(columnOrderByAccuracy([0.5, 0.5])).toEqual([0, 1]);
  });
});
