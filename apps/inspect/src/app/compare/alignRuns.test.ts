import { describe, expect, test } from "vitest";

import { SampleSummary } from "../../client/api/types";
import { kScoreTypeBoolean, kScoreTypePassFail } from "../../constants";

import {
  alignRuns,
  inferScoreType,
  outcomeOf,
  resolveScorer,
  sampleKey,
  scorerOptions,
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

describe("inferScoreType", () => {
  test("booleans", () => {
    expect(inferScoreType(true)).toBe(kScoreTypeBoolean);
    expect(inferScoreType(false)).toBe(kScoreTypeBoolean);
  });
  test("pass/fail letters, case-insensitive", () => {
    expect(inferScoreType("C")).toBe(kScoreTypePassFail);
    expect(inferScoreType("i")).toBe(kScoreTypePassFail);
  });
  test("numbers are not pass/fail", () => {
    expect(inferScoreType(0.5)).toBe("");
  });
  test("free-text strings are not pass/fail", () => {
    expect(inferScoreType("foo")).toBe("");
  });
  test("missing value", () => {
    expect(inferScoreType(undefined)).toBe("");
  });
});

const scored = (names: string[]): SampleSummary => ({
  ...s(1, 1),
  scores: Object.fromEntries(
    names.map((name) => [name, { value: "C", history: [] }])
  ),
});

describe("scorerOptions", () => {
  test("lists the union, A's order first, flagging which side has each", () => {
    const a = [scored(["f1", "match"])];
    const b = [scored(["match", "judge"])];
    expect(
      scorerOptions(a, b).map(({ name, inA, inB }) => ({ name, inA, inB }))
    ).toEqual([
      { name: "f1", inA: true, inB: false },
      { name: "match", inA: true, inB: true },
      { name: "judge", inA: false, inB: true },
    ]);
  });
  test("collects names across all samples, not just the first", () => {
    const a = [s(1, 1), scored(["match"])];
    const b = [scored(["match"])];
    expect(scorerOptions(a, b).map((o) => o.name)).toEqual(["match"]);
  });
  test("summarizes each side as value_to_float mean over scored samples", () => {
    const a = [s(1, 1, "C"), s(2, 1, "I"), s(3, 1, "P"), s(4, 1)];
    const b = [s(1, 1, "C")];
    const [match] = scorerOptions(a, b);
    expect(match?.statA).toEqual({ mean: 0.5, n: 3 });
    expect(match?.statB).toEqual({ mean: 1, n: 1 });
  });
  test("no stat for the side without the scorer", () => {
    const [f1] = scorerOptions([scored(["f1"])], [s(1, 1)]);
    expect(f1?.statB).toBeUndefined();
  });
});

describe("resolveScorer", () => {
  const options = [
    { name: "f1", inA: true, inB: false },
    { name: "match", inA: true, inB: true },
    { name: "judge", inA: true, inB: true },
  ];
  test("keeps a requested scorer both runs have", () => {
    expect(resolveScorer(options, "judge")).toBe("judge");
  });
  test("falls back to the first common scorer for a one-sided request", () => {
    expect(resolveScorer(options, "f1")).toBe("match");
  });
  test("falls back when nothing is requested", () => {
    expect(resolveScorer(options, undefined)).toBe("match");
  });
  test("undefined when nothing is in common", () => {
    expect(
      resolveScorer([{ name: "f1", inA: true, inB: false }], "f1")
    ).toBeUndefined();
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
