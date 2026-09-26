import { ScoreValue } from "../../@types/extraInspect";
import { SampleSummary } from "../../client/api/types";

import { outcomeOf, sampleKey } from "./alignRuns";

export type GridOutcome = "pass" | "fail" | "other" | "error" | "missing";

export interface GridCell {
  runIndex: number;
  outcome: GridOutcome;
  value?: ScoreValue;
}

// "outlier": exactly one run disagrees with every other run that has a
// pass/fail outcome — the mistral-vs-everyone-else shape. "split": more
// than one run on the minority side — no single run to blame. "unanimous":
// every run that scored agrees (pass). "all-fail": every run that scored
// agrees, and the agreement is a fail — a pre-computed insight worth its
// own category, since it usually means the task or scorer is broken rather
// than N independent model failures. "no-data": fewer than two runs
// produced a pass/fail outcome here, so agreement isn't meaningful (errors,
// missing samples, or a scorer with no pass/fail semantics).
export type GridPattern =
  "unanimous" | "all-fail" | "outlier" | "split" | "no-data";

export interface GridRow {
  key: string;
  id: string | number;
  epoch: number;
  cells: GridCell[];
  votedRuns: number;
  disagreement: number;
  pattern: GridPattern;
  outlierRunIndex?: number;
}

/** Generalizes `firstCommonScorer` to N runs: the first scorer name present
 *  in every run's samples (order taken from the first run). */
export const firstCommonScorerN = (
  runs: SampleSummary[][]
): string | undefined => {
  const [first, ...rest] = runs;
  if (!first) return undefined;
  const restScorerSets = rest.map((samples) => {
    const names = new Set<string>();
    for (const sample of samples)
      for (const name of Object.keys(sample.scores ?? {})) names.add(name);
    return names;
  });
  for (const sample of first) {
    for (const name of Object.keys(sample.scores ?? {})) {
      if (restScorerSets.every((names) => names.has(name))) return name;
    }
  }
  return undefined;
};

const cellOutcome = (
  sample: SampleSummary | undefined,
  scorer: string | undefined
): { outcome: GridOutcome; value?: ScoreValue } => {
  if (!sample) return { outcome: "missing" };
  if (sample.error) return { outcome: "error" };
  const value =
    scorer === undefined ? undefined : sample.scores?.[scorer]?.value;
  return { outcome: outcomeOf(value), value };
};

/**
 * Aligns N runs by (id, epoch) into a samples x runs matrix, with a
 * per-row disagreement measure. `runs[i]` is the sample list for column i;
 * cell `runIndex` matches that column order.
 */
export const alignRunsGrid = (
  runs: SampleSummary[][],
  scorer: string | undefined
): GridRow[] => {
  const maps = runs.map((samples) => {
    const byKey = new Map<string, SampleSummary>();
    for (const sample of samples)
      byKey.set(sampleKey(sample.id, sample.epoch), sample);
    return byKey;
  });

  // Row order: first-seen (id, epoch) across runs, in run order — same rule
  // as alignRuns for two runs.
  const rowMeta: { key: string; id: string | number; epoch: number }[] = [];
  const seen = new Set<string>();
  for (const samples of runs) {
    for (const sample of samples) {
      const key = sampleKey(sample.id, sample.epoch);
      if (!seen.has(key)) {
        seen.add(key);
        rowMeta.push({ key, id: sample.id, epoch: sample.epoch });
      }
    }
  }

  return rowMeta.map(({ key, id, epoch }) => {
    const cells: GridCell[] = maps.map((byKey, runIndex) => ({
      runIndex,
      ...cellOutcome(byKey.get(key), scorer),
    }));

    const passRuns = cells
      .filter((c) => c.outcome === "pass")
      .map((c) => c.runIndex);
    const failRuns = cells
      .filter((c) => c.outcome === "fail")
      .map((c) => c.runIndex);
    const votedRuns = passRuns.length + failRuns.length;
    const minority = passRuns.length <= failRuns.length ? passRuns : failRuns;

    let pattern: GridPattern;
    let outlierRunIndex: number | undefined;
    if (votedRuns < 2) {
      pattern = "no-data";
    } else if (minority.length === 0) {
      pattern = failRuns.length === votedRuns ? "all-fail" : "unanimous";
    } else if (minority.length === 1) {
      pattern = "outlier";
      outlierRunIndex = minority[0];
    } else {
      pattern = "split";
    }

    return {
      key,
      id,
      epoch,
      cells,
      votedRuns,
      disagreement: votedRuns >= 2 ? minority.length / votedRuns : 0,
      pattern,
      outlierRunIndex,
    };
  });
};

/** Which sample ids span more than one epoch in this grid — used to decide
 *  whether a row's epoch needs a "#N" suffix at all. Showing "#1" only once
 *  a "#2" exists elsewhere keeps single-epoch rows uncluttered while making
 *  "19 #1" / "19 #2" consistent once both are present (UX review). */
export const idsWithMultipleEpochs = (
  rows: GridRow[]
): Set<string | number> => {
  const epochsById = new Map<string | number, Set<number>>();
  for (const row of rows) {
    const epochs = epochsById.get(row.id) ?? new Set<number>();
    epochs.add(row.epoch);
    epochsById.set(row.id, epochs);
  }
  const multi = new Set<string | number>();
  for (const [id, epochs] of epochsById) if (epochs.size > 1) multi.add(id);
  return multi;
};

/** Rows most worth a researcher's attention first: biggest disagreement,
 *  then a stable tie-break so re-sorting the same data doesn't reshuffle. */
export const sortByDisagreement = (rows: GridRow[]): GridRow[] =>
  [...rows].sort(
    (a, b) =>
      b.disagreement - a.disagreement ||
      String(a.id).localeCompare(String(b.id)) ||
      a.epoch - b.epoch
  );

/**
 * Which run to pair against `baselineIndex` when a row (not a specific
 * cell) is clicked: the run that disagrees with the baseline, preferring
 * the row's lone outlier (the "real difference" case) over an arbitrary
 * other run.
 */
export const rowCompareTarget = (
  row: GridRow,
  baselineIndex: number
): number | undefined => {
  if (
    row.outlierRunIndex !== undefined &&
    row.outlierRunIndex !== baselineIndex
  ) {
    return row.outlierRunIndex;
  }
  const baselineOutcome = row.cells[baselineIndex]?.outcome;
  const differing = row.cells.find(
    (c) => c.runIndex !== baselineIndex && c.outcome !== baselineOutcome
  );
  if (differing) return differing.runIndex;
  return row.cells.find((c) => c.runIndex !== baselineIndex)?.runIndex;
};
