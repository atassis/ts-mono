import { describe, expect, test } from "vitest";

import { SampleSummary } from "../../client/api/types";

import { alignRuns } from "./alignRuns";
import { groupBySample, sortGroups } from "./sampleGroups";

const s = (
  id: number,
  epoch: number,
  value?: string,
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

// "CCI" -> epochs 1..3 scored C, C, I; "-" leaves that epoch out.
const run = (id: number, marks: string): SampleSummary[] =>
  [...marks].flatMap((m, i) => (m === "-" ? [] : [s(id, i + 1, m)]));

const group = (a: SampleSummary[], b: SampleSummary[]) => {
  const [g] = groupBySample(alignRuns(a, b, "match"));
  if (!g) throw new Error("no group");
  return g;
};

describe("groupBySample", () => {
  test("one group per sample, epochs as aligned marks", () => {
    const g = group(run(1, "CCI"), run(1, "C-"));
    expect(g.epochs).toEqual([1, 2, 3]);
    expect(g.a.map((c) => c.mark)).toEqual(["pass", "pass", "fail"]);
    expect(g.b.map((c) => c.mark)).toEqual(["pass", "missing", "missing"]);
    expect([g.passA, g.scoredA, g.passB, g.scoredB]).toEqual([2, 3, 1, 1]);
  });

  test("categorizes by per-sample pass rate", () => {
    expect(group(run(1, "CC"), run(1, "CC")).category).toBe("both-pass");
    expect(group(run(1, "II"), run(1, "II")).category).toBe("both-fail");
    expect(group(run(1, "CC"), run(1, "CI")).category).toBe("regressed");
    expect(group(run(1, "IC"), run(1, "CC")).category).toBe("improved");
    expect(group(run(1, "CI"), run(1, "IC")).category).toBe("unchanged");
  });

  test("flags samples that are mixed within a run", () => {
    expect(group(run(1, "CI"), run(1, "IC")).flaky).toBe(true);
    expect(group(run(1, "CC"), run(1, "II")).flaky).toBe(false);
  });

  test("errored epochs are marked but not counted", () => {
    const g = group(run(1, "CC"), [s(1, 1, "C"), s(1, 2, "C", { error: "x" })]);
    expect(g.b.map((c) => c.mark)).toEqual(["pass", "error"]);
    expect([g.passB, g.scoredB]).toEqual([1, 1]);
    expect(g.category).toBe("both-pass");
  });

  test("error when a side has nothing scored", () => {
    const g = group(run(1, "C"), [s(1, 1, "C", { error: "x" })]);
    expect(g.category).toBe("error");
  });

  test("one-sided samples", () => {
    expect(group(run(1, "C"), []).category).toBe("only-a");
    expect(group([], run(1, "C")).category).toBe("only-b");
  });

  test("focuses the first epoch where A and B disagree", () => {
    expect(group(run(1, "CCI"), run(1, "CCC")).focusKey).toBe("1#3");
    expect(group(run(1, "CC"), run(1, "CC")).focusKey).toBe("1#1");
  });
});

describe("sortGroups", () => {
  test("changes first (biggest gap first), then flaky, then stable", () => {
    const rows = alignRuns(
      [...run(1, "CC"), ...run(2, "CC"), ...run(3, "CI"), ...run(4, "CC")],
      [...run(1, "CC"), ...run(2, "CI"), ...run(3, "IC"), ...run(4, "II")],
      "match"
    );
    expect(sortGroups(groupBySample(rows)).map((g) => g.id)).toEqual([
      4, 2, 3, 1,
    ]);
  });
});
