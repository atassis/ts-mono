import { describe, expect, test } from "vitest";

import { SampleSummary } from "../../client/api/types";

import { alignRunsGrid } from "./alignRunsGrid";
import {
  compareTarget,
  focusKey,
  groupGridBySample,
  sortGridSamples,
} from "./gridGroups";

const s = (id: number, epoch: number, value: string): SampleSummary => ({
  id,
  epoch,
  input: "",
  target: "",
  scores: { match: { value, history: [] } },
  metadata: {},
  completed: true,
  model_usage: {},
  role_usage: {},
});

// Each run is a string of epoch marks for one sample id: "CI" = epoch 1 C, epoch 2 I.
const grid = (id: number, ...runs: string[]) =>
  groupGridBySample(
    alignRunsGrid(
      runs.map((marks) => [...marks].map((m, i) => s(id, i + 1, m))),
      "match"
    )
  );

const verdictOf = (...runs: string[]) => grid(1, ...runs)[0]?.verdict;

describe("groupGridBySample", () => {
  test("one row per sample with per-run marks and tallies", () => {
    const [row] = grid(7, "CC", "CI", "II");
    expect(row?.epochs).toEqual([1, 2]);
    expect(row?.cells.map((c) => [c.pass, c.scored, c.state])).toEqual([
      [2, 2, "pass"],
      [1, 2, "mixed"],
      [0, 2, "fail"],
    ]);
    expect(row?.cells[1]?.marks.map((m) => m.mark)).toEqual(["pass", "fail"]);
  });

  test("verdicts", () => {
    expect(verdictOf("CC", "CC", "CC")).toEqual({ kind: "all-pass" });
    expect(verdictOf("II", "II", "II")).toEqual({ kind: "all-fail" });
    expect(verdictOf("CC", "CC", "II")).toEqual({
      kind: "outlier",
      run: 2,
      direction: "fails",
    });
    expect(verdictOf("II", "CC", "II")).toEqual({
      kind: "outlier",
      run: 1,
      direction: "passes",
    });
    expect(verdictOf("CC", "CC", "II", "II")).toEqual({
      kind: "split",
      pass: 2,
      fail: 2,
      mixed: 0,
    });
    expect(verdictOf("CC", "CI", "CC")).toEqual({ kind: "flaky", runs: [1] });
    expect(verdictOf("CC", "CI", "II")).toEqual({
      kind: "split",
      pass: 1,
      fail: 1,
      mixed: 1,
    });
  });
});

describe("sortGridSamples", () => {
  test("outliers and splits first, then flaky, all-fail, all-pass", () => {
    const rows = [
      ...grid(1, "CC", "CC", "CC"),
      ...grid(2, "II", "II", "II"),
      ...grid(3, "CC", "CI", "CC"),
      ...grid(4, "CC", "CC", "II"),
    ];
    expect(sortGridSamples(rows).map((r) => r.id)).toEqual([4, 3, 2, 1]);
  });
});

describe("compareTarget / focusKey", () => {
  test("pairs the baseline with the outlier, opening the first differing epoch", () => {
    const [row] = grid(5, "CC", "CC", "CI");
    if (!row) throw new Error("no row");
    expect(compareTarget(row, 0)).toBe(2);
    expect(focusKey(row, 0, 2)).toBe("5#2");
  });

  test("the outlier as baseline pairs with the first run that differs", () => {
    const [row] = grid(5, "CC", "CC", "II");
    if (!row) throw new Error("no row");
    expect(compareTarget(row, 2)).toBe(0);
  });
});
