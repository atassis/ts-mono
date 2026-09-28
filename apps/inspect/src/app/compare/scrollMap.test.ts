import { describe, expect, test } from "vitest";

import {
  advance,
  panePositions,
  Position,
  positionFromPane,
  segmentMode,
} from "./scrollMap";

// xorshift32, deterministic across runs.
const rng = (seed: number) => {
  let x = seed;
  return (): number => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0xffffffff;
  };
};

const closeTo = (a: number, b: number, eps = 1e-6): void => {
  expect(Math.abs(a - b)).toBeLessThan(eps);
};

const posEq = (p: Position, q: Position, eps = 1e-6): void => {
  closeTo(p.k, q.k, eps);
  closeTo(p.t, q.t, eps);
};

describe("segmentMode", () => {
  test("proportional when the ratio is within bounds", () => {
    expect(segmentMode(100, 100)).toBe("proportional");
    expect(segmentMode(100, 300)).toBe("proportional"); // exactly at ratio
    expect(segmentMode(0, 3)).toBe("proportional"); // floor(min, 1)
  });

  test("pause once the longer side outgrows the shorter by more than ratio", () => {
    expect(segmentMode(100, 301)).toBe("pause");
    expect(segmentMode(0, 4)).toBe("pause");
  });

  test("ratio is configurable", () => {
    expect(segmentMode(100, 150, 1)).toBe("pause");
    expect(segmentMode(100, 150, 2)).toBe("proportional");
  });
});

describe("panePositions", () => {
  const offsetsA = [0, 100, 300, 300, 500];
  const offsetsB = [0, 100, 320, 400, 500];

  test("t=0 of segment k puts both panes exactly on anchor k", () => {
    for (let k = 0; k < offsetsA.length - 1; k++) {
      const { a, b } = panePositions({ k, t: 0 }, offsetsA, offsetsB);
      expect(a).toBeCloseTo(offsetsA[k] ?? 0);
      expect(b).toBeCloseTo(offsetsB[k] ?? 0);
    }
  });

  test("t=1 of segment k puts both panes exactly on anchor k+1", () => {
    for (let k = 0; k < offsetsA.length - 1; k++) {
      const { a, b } = panePositions({ k, t: 1 }, offsetsA, offsetsB);
      expect(a).toBeCloseTo(offsetsA[k + 1] ?? 0);
      expect(b).toBeCloseTo(offsetsB[k + 1] ?? 0);
    }
  });

  test("proportional segment scales each side by t", () => {
    // segment 0: la=100, lb=100 -> proportional
    const { a, b } = panePositions({ k: 0, t: 0.5 }, offsetsA, offsetsB);
    expect(a).toBeCloseTo(50);
    expect(b).toBeCloseTo(50);
  });

  test("pause segment: short side rests at its end", () => {
    // segment 2: la=0, lb=80 -> pause (la=0 always pauses past ratio)
    const early = panePositions({ k: 2, t: 0.3 }, offsetsA, offsetsB);
    expect(early.a).toBeCloseTo(300); // rests immediately, la=0
    expect(early.b).toBeCloseTo(320 + 0.3 * 80);

    const late = panePositions({ k: 2, t: 0.9 }, offsetsA, offsetsB);
    expect(late.a).toBeCloseTo(300); // still resting
    expect(late.b).toBeCloseTo(320 + 0.9 * 80);
  });

  test("monotone non-decreasing across k and t for both panes", () => {
    let prevA = -Infinity;
    let prevB = -Infinity;
    const points: Position[] = [];
    for (let k = 0; k < offsetsA.length - 1; k++) {
      for (let i = 0; i <= 10; i++) points.push({ k, t: i / 10 });
    }
    for (const p of points) {
      const { a, b } = panePositions(p, offsetsA, offsetsB);
      expect(a).toBeGreaterThanOrEqual(prevA - 1e-9);
      expect(b).toBeGreaterThanOrEqual(prevB - 1e-9);
      prevA = a;
      prevB = b;
    }
  });
});

describe("positionFromPane", () => {
  const offsetsA = [0, 100, 300, 300, 500];
  const offsetsB = [0, 100, 320, 400, 500];

  test("round trip on the moving side within a proportional segment", () => {
    const p: Position = { k: 0, t: 0.37 };
    const { a } = panePositions(p, offsetsA, offsetsB);
    const back = positionFromPane("a", a, offsetsA, offsetsB);
    posEq(back, p);
  });

  test("round trip on the moving (longer) side within a pause segment", () => {
    const p: Position = { k: 2, t: 0.6 };
    const { b } = panePositions(p, offsetsA, offsetsB);
    const back = positionFromPane("b", b, offsetsA, offsetsB);
    posEq(back, p);
  });

  test("resting side inverse picks the smallest t that reaches that px", () => {
    // 300 is both offsetsA[2] and offsetsA[3] (segment 2 is zero-length on
    // A); the canonical answer is t=0 of the later segment (3), not some
    // arbitrary t deep inside segment 2's resting range.
    const back = positionFromPane("a", 300, offsetsA, offsetsB);
    expect(back.k).toBe(3);
    expect(back.t).toBeCloseTo(0);
  });

  test("boundary px canonicalizes to t=0 of the later segment", () => {
    const back = positionFromPane("a", 300, offsetsA, offsetsB);
    expect(back).toEqual({ k: 3, t: 0 });
  });

  test("clamps outside the pane range", () => {
    expect(positionFromPane("a", -50, offsetsA, offsetsB)).toEqual({
      k: 0,
      t: 0,
    });
    expect(positionFromPane("a", 9999, offsetsA, offsetsB)).toEqual({
      k: 3,
      t: 1,
    });
  });
});

describe("advance", () => {
  const offsetsA = [0, 100, 300, 300, 500];
  const offsetsB = [0, 100, 320, 400, 500];

  test("driver moves 1:1 while it can move", () => {
    const start: Position = { k: 0, t: 0 };
    const next = advance(start, "a", 40, offsetsA, offsetsB);
    const { a: aBefore } = panePositions(start, offsetsA, offsetsB);
    const { a: aAfter } = panePositions(next, offsetsA, offsetsB);
    closeTo(aAfter - aBefore, 40);
  });

  test("driver resting (zero-length side) advances by the other side's pixels", () => {
    // segment 2: la=0, so driving "a" there must move by B's pixels.
    const start: Position = { k: 2, t: 0 };
    const next = advance(start, "a", 40, offsetsA, offsetsB);
    const { b: bBefore } = panePositions(start, offsetsA, offsetsB);
    const { b: bAfter } = panePositions(next, offsetsA, offsetsB);
    closeTo(bAfter - bBefore, 40);
  });

  test("crosses segment boundaries, carrying the remaining delta", () => {
    // segment 0 is 100px on both sides; driving 250 from the start lands
    // 150px into segment 1 (which is 200/300 -> proportional, la=lb=200... wait
    // recompute against the actual offsets below).
    const start: Position = { k: 0, t: 0 };
    const next = advance(start, "a", 250, offsetsA, offsetsB);
    const { a } = panePositions(next, offsetsA, offsetsB);
    closeTo(a, 250);
  });

  test("negative deltas move backward and cross segment boundaries too", () => {
    const start: Position = { k: 3, t: 0.5 };
    const next = advance(start, "b", -150, offsetsA, offsetsB);
    const { b: bBefore } = panePositions(start, offsetsA, offsetsB);
    const { b: bAfter } = panePositions(next, offsetsA, offsetsB);
    closeTo(bBefore - bAfter, 150);
  });

  test("clamps at START", () => {
    const next = advance({ k: 0, t: 0 }, "a", -500, offsetsA, offsetsB);
    expect(next).toEqual({ k: 0, t: 0 });
  });

  test("clamps at END", () => {
    const maxK = offsetsA.length - 2;
    const next = advance({ k: maxK, t: 1 }, "a", 500, offsetsA, offsetsB);
    expect(next).toEqual({ k: maxK, t: 1 });
  });

  test("n=2 (only START/END anchors), ratio switch between modes", () => {
    const a2 = [0, 100];
    const b2 = [0, 400]; // ratio 4 -> pause by default, proportional with ratio>=4
    expect(segmentMode(100, 400)).toBe("pause");
    const paused = advance({ k: 0, t: 0 }, "a", 50, a2, b2);
    closeTo(panePositions(paused, a2, b2).a, 50);

    const prop = advance({ k: 0, t: 0 }, "a", 50, a2, b2, 4);
    closeTo(panePositions(prop, a2, b2, 4).a, 50);
    expect(segmentMode(100, 400, 4)).toBe("proportional");
  });
});

describe("no-drift property", () => {
  const offsetsA = [0, 50, 50, 220, 400, 400, 900];
  const offsetsB = [0, 200, 260, 260, 420, 900, 900];
  const maxK = offsetsA.length - 2;

  test("any sequence of advance calls, reversed and negated, returns to start", () => {
    const rand = rng(1234567);
    // Small deltas from a mid-path start, well inside the ~900px range on
    // each side, so no step clamps at START/END (clamping is lossy and
    // would break reversibility by construction, not a bug to catch here).
    for (let trial = 0; trial < 30; trial++) {
      const steps: { driver: "a" | "b"; delta: number }[] = [];
      const stepCount = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < stepCount; i++) {
        steps.push({
          driver: rand() < 0.5 ? "a" : "b",
          delta: (rand() - 0.5) * 60,
        });
      }
      const start: Position = { k: Math.floor(maxK / 2), t: 0.5 };

      let pos = start;
      for (const step of steps) {
        pos = advance(pos, step.driver, step.delta, offsetsA, offsetsB);
      }
      for (const step of [...steps].reverse()) {
        pos = advance(pos, step.driver, -step.delta, offsetsA, offsetsB);
      }
      posEq(pos, start, 1e-6);
    }
  });
});

describe("zero-length segments", () => {
  test("zero-length segment on both sides passes through instantly", () => {
    const offsetsA = [0, 100, 100, 300];
    const offsetsB = [0, 100, 100, 300];
    const next = advance({ k: 1, t: 0 }, "a", 10, offsetsA, offsetsB);
    // segment 1 is 0px both sides: the 10px must land in segment 2.
    expect(next.k).toBe(2);
    closeTo(panePositions(next, offsetsA, offsetsB).a, 110);
  });
});
