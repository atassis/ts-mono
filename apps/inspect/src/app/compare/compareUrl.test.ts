import { describe, expect, test } from "vitest";

import { compareUrl } from "./compareUrl";

describe("compareUrl", () => {
  test("encodes both logs", () => {
    expect(compareUrl("run a.eval", "b.eval")).toBe(
      "/compare?a=run+a.eval&b=b.eval"
    );
  });

  test("adds the selected sample", () => {
    expect(compareUrl("a.eval", "b.eval", "x#2")).toBe(
      "/compare?a=a.eval&b=b.eval&sample=x%232"
    );
  });
});
