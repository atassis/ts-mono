import { describe, expect, test } from "vitest";

import { SampleSummary } from "../../client/api/types";

import {
  alignRuns,
  firstCommonScorer,
  outcomeOf,
  sampleKey,
} from "./alignRuns";

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

describe("sampleKey", () => {
  test("treats numeric and string ids alike", () => {
    expect(sampleKey(1, 2)).toBe(sampleKey("1", 2));
  });
});

describe("outcomeOf", () => {
  test("pass/fail letters", () => {
    expect(outcomeOf("C")).toBe("pass");
    expect(outcomeOf("I")).toBe("fail");
    expect(outcomeOf("P")).toBe("other");
  });
  test("booleans", () => {
    expect(outcomeOf(true)).toBe("pass");
    expect(outcomeOf(false)).toBe("fail");
  });
  test("numbers are not pass/fail", () => {
    expect(outcomeOf(0.5)).toBe("other");
  });
  test("missing value", () => {
    expect(outcomeOf(undefined)).toBe("other");
  });
});

describe("firstCommonScorer", () => {
  test("picks first scorer present in both runs", () => {
    const a = [
      {
        ...s(1, 1),
        scores: {
          f1: { value: 1, history: [] },
          match: { value: "C", history: [] },
        },
      },
    ];
    const b = [s(1, 1, "I")];
    expect(firstCommonScorer(a, b)).toBe("match");
  });
  test("undefined when nothing in common", () => {
    expect(firstCommonScorer([s(1, 1)], [s(1, 1)])).toBeUndefined();
  });
});

describe("alignRuns", () => {
  test("categorizes pass/fail pairs", () => {
    const a = [s(1, 1, "C"), s(2, 1, "I"), s(3, 1, "C"), s(4, 1, "I")];
    const b = [s(1, 1, "C"), s(2, 1, "C"), s(3, 1, "I"), s(4, 1, "I")];
    expect(alignRuns(a, b, "match").map((r) => r.category)).toEqual([
      "both-pass",
      "improved",
      "regressed",
      "both-fail",
    ]);
  });

  test("numeric scores use delta", () => {
    const a = [s(1, 1, 0.2), s(2, 1, 0.9), s(3, 1, 0.5)];
    const b = [s(1, 1, 0.7), s(2, 1, 0.1), s(3, 1, 0.5)];
    const rows = alignRuns(a, b, "match");
    expect(rows.map((r) => r.category)).toEqual([
      "improved",
      "regressed",
      "unchanged",
    ]);
    expect(rows[0]?.delta).toBeCloseTo(0.5);
  });

  test("matches by (id, epoch), not position; one-sided samples last", () => {
    const a = [s(1, 1, "C"), s(1, 2, "I"), s(9, 1, "C")];
    const b = [s(1, 2, "C"), s(1, 1, "C"), s(7, 1, "C")];
    const rows = alignRuns(a, b, "match");
    expect(rows.map((r) => [r.key, r.category])).toEqual([
      [sampleKey(1, 1), "both-pass"],
      [sampleKey(1, 2), "improved"],
      [sampleKey(9, 1), "only-a"],
      [sampleKey(7, 1), "only-b"],
    ]);
  });

  test("errors win over scores", () => {
    const a = [s(1, 1, "C", { error: "boom" })];
    const b = [s(1, 1, "C")];
    expect(alignRuns(a, b, "match")[0]?.category).toBe("error");
  });

  test("no scorer: unchanged unless one-sided or error", () => {
    const rows = alignRuns([s(1, 1)], [s(1, 1)], undefined);
    expect(rows[0]?.category).toBe("unchanged");
  });

  test("partial vs pass/fail is scored numerically, not hidden as unchanged", () => {
    expect(alignRuns([s(1, 1, "P")], [s(1, 1, "C")], "match")[0]).toMatchObject(
      { category: "improved", delta: 0.5 }
    );
    expect(alignRuns([s(1, 1, "C")], [s(1, 1, "P")], "match")[0]).toMatchObject(
      { category: "regressed" }
    );
    expect(alignRuns([s(1, 1, "P")], [s(1, 1, "I")], "match")[0]).toMatchObject(
      { category: "regressed" }
    );
    expect(alignRuns([s(1, 1, "P")], [s(1, 1, "P")], "match")[0]).toMatchObject(
      { category: "unchanged", delta: 0 }
    );
  });

  test("letter vs numeric score is scored numerically", () => {
    expect(alignRuns([s(1, 1, "P")], [s(1, 1, 0.9)], "match")[0]).toMatchObject(
      { category: "improved" }
    );
  });

  test("two unmappable free-text values are unchanged, no delta", () => {
    const row = alignRuns([s(1, 1, "foo")], [s(1, 1, "bar")], "match")[0];
    expect(row?.category).toBe("unchanged");
    expect(row?.delta).toBeUndefined();
  });
});
