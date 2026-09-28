import { describe, expect, test } from "vitest";

import { syncStatus } from "./syncStatus";

// A: 4 turns, B: 10 turns; A's turns 0 and 2 pair with B's 3 and 8.
const pairs = [
  { a: 0, b: 3 },
  { a: 2, b: 8 },
];
// START, the two anchors, END. Segment 1 (between the anchors) pauses A:
// 100px against B's 1000px.
const offsets = { a: [0, 100, 200, 600], b: [0, 300, 1300, 1500] };

describe("syncStatus", () => {
  test("before the first common step", () => {
    expect(syncStatus({ k: 0, t: 0.5 }, offsets, pairs, 4, 10)).toEqual({
      stepA: undefined,
      stepB: undefined,
      resting: undefined,
      extraA: 0,
      extraB: 3,
      tail: false,
    });
  });

  test("the waiting side is already at the step closing the stretch", () => {
    expect(syncStatus({ k: 1, t: 0.5 }, offsets, pairs, 4, 10)).toEqual({
      stepA: 3,
      stepB: 4,
      resting: "a",
      extraA: 1,
      extraB: 4,
      tail: false,
    });
  });

  test("a side still moving through its stretch is not waiting", () => {
    expect(syncStatus({ k: 1, t: 0.05 }, offsets, pairs, 4, 10).resting).toBe(
      undefined
    );
  });

  test("past the last common step", () => {
    expect(syncStatus({ k: 2, t: 0.1 }, offsets, pairs, 4, 10)).toMatchObject({
      stepA: 3,
      stepB: 9,
      extraA: 1,
      extraB: 1,
      tail: true,
    });
  });
});
