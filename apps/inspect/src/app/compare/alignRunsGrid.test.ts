import { describe, expect, test } from "vitest";

import { SampleSummary } from "../../client/api/types";

import {
  alignRunsGrid,
  firstCommonScorerN,
  rowCompareTarget,
  sortByDisagreement,
} from "./alignRunsGrid";

const s = (
  id: string | number,
  epoch: number,
  value?: string | number | boolean,
  extra: Partial<SampleSummary> = {}
): SampleSummary => ({
  id,
  epoch,
  input: "",
  target: "",
  scores: value === undefined ? null : { match: { value, history: [] } },
  metadata: {},
  completed: true,
  model_usage: {},
  role_usage: {},
  ...extra,
});

describe("alignRunsGrid", () => {
  test("unanimous row: every run agrees", () => {
    const runs = [[s(1, 1, "C")], [s(1, 1, "C")], [s(1, 1, "C")]];
    const [row] = alignRunsGrid(runs, "match");
    expect(row).toMatchObject({ pattern: "unanimous", disagreement: 0 });
  });

  test("outlier row: one run disagrees with the rest (the mistral shape)", () => {
    const runs = [
      [s(1, 1, "C")],
      [s(1, 1, "C")],
      [s(1, 1, "C")],
      [s(1, 1, "I")],
    ];
    const [row] = alignRunsGrid(runs, "match");
    expect(row).toMatchObject({ pattern: "outlier", outlierRunIndex: 3 });
    expect(row?.disagreement).toBeCloseTo(0.25);
  });

  test("split row: no single run to blame (2 vs 2)", () => {
    const runs = [
      [s(1, 1, "C")],
      [s(1, 1, "C")],
      [s(1, 1, "I")],
      [s(1, 1, "I")],
    ];
    const [row] = alignRunsGrid(runs, "match");
    expect(row).toMatchObject({ pattern: "split" });
    expect(row?.outlierRunIndex).toBeUndefined();
    expect(row?.disagreement).toBeCloseTo(0.5);
  });

  test("missing sample in one run: cell is 'missing', doesn't count as disagreement", () => {
    const runs = [[s(1, 1, "C")], [s(1, 1, "C")], [] as SampleSummary[]];
    const [row] = alignRunsGrid(runs, "match");
    expect(row?.cells[2]).toMatchObject({ outcome: "missing" });
    expect(row).toMatchObject({ pattern: "unanimous", votedRuns: 2 });
  });

  test("errored sample: its own outcome, not folded into pass/fail", () => {
    const runs = [[s(1, 1, "C")], [s(1, 1, "C", { error: "boom" })]];
    const [row] = alignRunsGrid(runs, "match");
    expect(row?.cells[1]).toMatchObject({ outcome: "error" });
    expect(row?.pattern).toBe("no-data");
  });

  test("fewer than 2 pass/fail outcomes: no-data, not a fake unanimous", () => {
    const runs = [[s(1, 1, "C")], [] as SampleSummary[], [] as SampleSummary[]];
    const [row] = alignRunsGrid(runs, "match");
    expect(row?.pattern).toBe("no-data");
  });

  test("matches by (id, epoch) across runs of different sizes, first-seen order", () => {
    const runs = [
      [s(1, 1, "C"), s(2, 1, "C")],
      [s(2, 1, "C"), s(1, 1, "C"), s(3, 1, "C")],
    ];
    const rows = alignRunsGrid(runs, "match");
    expect(rows.map((r) => r.key)).toEqual(["1#1", "2#1", "3#1"]);
    expect(rows[2]?.cells[0]).toMatchObject({ outcome: "missing" });
  });

  test("no scorer given: every cell is 'other', no-data throughout", () => {
    const runs = [[s(1, 1, "C")], [s(1, 1, "I")]];
    const [row] = alignRunsGrid(runs, undefined);
    expect(row?.cells.every((c) => c.outcome === "other")).toBe(true);
    expect(row?.pattern).toBe("no-data");
  });
});

describe("firstCommonScorerN", () => {
  test("picks a scorer present in every run", () => {
    const runs = [
      [
        {
          ...s(1, 1),
          scores: {
            f1: { value: 1, history: [] },
            match: { value: "C", history: [] },
          },
        },
      ],
      [s(1, 1, "I")],
      [
        {
          ...s(1, 1),
          scores: {
            match: { value: "C", history: [] },
            extra: { value: 1, history: [] },
          },
        },
      ],
    ];
    expect(firstCommonScorerN(runs)).toBe("match");
  });

  test("undefined when no scorer is in all runs", () => {
    expect(firstCommonScorerN([[s(1, 1, "C")], [s(1, 1)]])).toBeUndefined();
  });
});

describe("sortByDisagreement", () => {
  test("highest disagreement first; ties broken by id then epoch", () => {
    const runs = [
      [s(1, 1, "C"), s(2, 1, "C"), s(3, 1, "C")],
      [s(1, 1, "C"), s(2, 1, "I"), s(3, 1, "C")],
      [s(1, 1, "I"), s(2, 1, "I"), s(3, 1, "C")],
    ];
    const rows = alignRunsGrid(runs, "match");
    expect(sortByDisagreement(rows).map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

describe("rowCompareTarget", () => {
  test("prefers the row's outlier over an arbitrary other run", () => {
    const runs = [
      [s(1, 1, "C")],
      [s(1, 1, "C")],
      [s(1, 1, "C")],
      [s(1, 1, "I")],
    ];
    const [row] = alignRunsGrid(runs, "match");
    expect(row).toBeDefined();
    if (row) expect(rowCompareTarget(row, 0)).toBe(3);
  });

  test("baseline is itself the outlier: pick a run that actually differs", () => {
    const runs = [[s(1, 1, "I")], [s(1, 1, "C")], [s(1, 1, "C")]];
    const [row] = alignRunsGrid(runs, "match");
    expect(row).toBeDefined();
    if (row) expect(rowCompareTarget(row, 0)).toBe(1);
  });

  test("no disagreement at all: falls back to the first other run", () => {
    const runs = [[s(1, 1, "C")], [s(1, 1, "C")], [s(1, 1, "C")]];
    const [row] = alignRunsGrid(runs, "match");
    expect(row).toBeDefined();
    if (row) expect(rowCompareTarget(row, 0)).toBe(1);
  });
});
