import { SampleSummary } from "../../client/api/types";

import { AlignedSample, outcomeOf, sampleKey } from "./alignRuns";
import { failureKind } from "./failureKind";

export type EpochMark =
  "pass" | "fail" | "other" | "error" | "limit" | "missing";

export type GroupCategory =
  | "improved"
  | "regressed"
  | "both-pass"
  | "both-fail"
  | "unchanged"
  | "only-a"
  | "only-b"
  | "error";

export interface EpochCell {
  epoch: number;
  key: string;
  mark: EpochMark;
}

/** One sample across all its epochs in both runs. */
export interface SampleGroup {
  id: string | number;
  epochs: number[];
  a: EpochCell[];
  b: EpochCell[];
  passA: number;
  scoredA: number;
  passB: number;
  scoredB: number;
  category: GroupCategory;
  /** Passes in some epochs and fails in others, within A or within B. */
  flaky: boolean;
  /** The epoch a click on the whole row opens: the first where A and B
   *  disagree, else the first. */
  focusKey: string;
}

const markOf = (
  sample: SampleSummary | undefined,
  value: AlignedSample["valueA"]
): EpochMark => {
  if (!sample) return "missing";
  const kind = failureKind(sample);
  if (kind.kind === "error") return "error";
  if (kind.kind === "limit") return "limit";
  const outcome = outcomeOf(value);
  return outcome === "other" ? "other" : outcome;
};

// A limit hit is a scored failure (the scorer marks it incorrect), so it
// counts toward the tally; errors and missing epochs do not.
const tally = (cells: EpochCell[]): { pass: number; scored: number } => ({
  pass: cells.filter((c) => c.mark === "pass").length,
  scored: cells.filter(
    (c) => c.mark === "pass" || c.mark === "fail" || c.mark === "limit"
  ).length,
});

const categorize = (
  a: EpochCell[],
  b: EpochCell[],
  rateA: number | undefined,
  rateB: number | undefined
): GroupCategory => {
  const hasA = a.some((c) => c.mark !== "missing");
  const hasB = b.some((c) => c.mark !== "missing");
  if (!hasB) return "only-a";
  if (!hasA) return "only-b";
  if (rateA === undefined || rateB === undefined) return "error";
  if (rateA === 1 && rateB === 1) return "both-pass";
  if (rateA === 0 && rateB === 0) return "both-fail";
  if (rateB > rateA) return "improved";
  if (rateB < rateA) return "regressed";
  return "unchanged";
};

const isMixed = (rate: number | undefined): boolean =>
  rate !== undefined && rate > 0 && rate < 1;

export const groupBySample = (rows: AlignedSample[]): SampleGroup[] => {
  const byId = new Map<string, AlignedSample[]>();
  for (const row of rows) {
    const id = String(row.id);
    byId.set(id, [...(byId.get(id) ?? []), row]);
  }
  return [...byId.values()].flatMap((group) => {
    const first = group[0];
    if (!first) return [];
    const byEpoch = new Map(group.map((r) => [r.epoch, r]));
    const epochs = [...byEpoch.keys()].sort((x, y) => x - y);
    const cells = (side: "a" | "b"): EpochCell[] =>
      epochs.map((epoch) => {
        const row = byEpoch.get(epoch);
        return {
          epoch,
          key: sampleKey(first.id, epoch),
          mark: markOf(
            side === "a" ? row?.a : row?.b,
            side === "a" ? row?.valueA : row?.valueB
          ),
        };
      });
    const a = cells("a");
    const b = cells("b");
    const ta = tally(a);
    const tb = tally(b);
    const rateA = ta.scored > 0 ? ta.pass / ta.scored : undefined;
    const rateB = tb.scored > 0 ? tb.pass / tb.scored : undefined;
    const disagree = a.find((cell, i) => cell.mark !== b[i]?.mark);
    return [
      {
        id: first.id,
        epochs,
        a,
        b,
        passA: ta.pass,
        scoredA: ta.scored,
        passB: tb.pass,
        scoredB: tb.scored,
        category: categorize(a, b, rateA, rateB),
        flaky: isMixed(rateA) || isMixed(rateB),
        focusKey: (disagree ?? a[0])?.key ?? sampleKey(first.id, 1),
      },
    ];
  });
};

const rate = (pass: number, scored: number): number =>
  scored > 0 ? pass / scored : 0;

const tier = (g: SampleGroup): number => {
  if (g.category === "improved" || g.category === "regressed") return 0;
  if (g.flaky) return 1;
  if (g.category === "both-pass" || g.category === "both-fail") return 3;
  return 2;
};

/** Where the runs disagree first (largest pass-rate gap first), then
 *  samples that flip within a run, then the stable rest; ties keep the
 *  input order. */
export const sortGroups = (groups: SampleGroup[]): SampleGroup[] =>
  groups
    .map((g, index) => ({
      g,
      index,
      gap: Math.abs(rate(g.passA, g.scoredA) - rate(g.passB, g.scoredB)),
    }))
    .sort((x, y) => tier(x.g) - tier(y.g) || y.gap - x.gap || x.index - y.index)
    .map(({ g }) => g);
