import { GridRow } from "./alignRunsGrid";
import { EpochCell, EpochMark } from "./sampleGroups";

export type RunState = "pass" | "fail" | "mixed" | "none";

export interface RunCell {
  runIndex: number;
  marks: EpochCell[];
  pass: number;
  scored: number;
  state: RunState;
}

export type SampleVerdict =
  | { kind: "all-pass" }
  | { kind: "all-fail" }
  | { kind: "outlier"; run: number; direction: "passes" | "fails" }
  | { kind: "split"; pass: number; fail: number; mixed: number }
  | { kind: "flaky"; runs: number[] }
  | { kind: "no-data" };

/** One sample across all runs and epochs. */
export interface GridSampleRow {
  id: string | number;
  epochs: number[];
  cells: RunCell[];
  verdict: SampleVerdict;
}

const stateOf = (pass: number, scored: number): RunState => {
  if (scored === 0) return "none";
  if (pass === scored) return "pass";
  if (pass === 0) return "fail";
  return "mixed";
};

const verdictOf = (cells: RunCell[]): SampleVerdict => {
  const by = (state: RunState) => cells.filter((c) => c.state === state);
  const pass = by("pass");
  const fail = by("fail");
  const mixed = by("mixed");
  if (pass.length + fail.length + mixed.length < 2) return { kind: "no-data" };
  if (mixed.length === 0) {
    if (fail.length === 0) return { kind: "all-pass" };
    if (pass.length === 0) return { kind: "all-fail" };
    const [lone] = fail.length === 1 ? fail : pass.length === 1 ? pass : [];
    if (lone && pass.length + fail.length > 2) {
      return {
        kind: "outlier",
        run: lone.runIndex,
        direction: fail.length === 1 ? "fails" : "passes",
      };
    }
  } else if (pass.length === 0 || fail.length === 0) {
    // Every run that is stable agrees; the rest flip between epochs.
    return { kind: "flaky", runs: mixed.map((c) => c.runIndex) };
  }
  return {
    kind: "split",
    pass: pass.length,
    fail: fail.length,
    mixed: mixed.length,
  };
};

export const groupGridBySample = (rows: GridRow[]): GridSampleRow[] => {
  const byId = new Map<string, GridRow[]>();
  for (const row of rows) {
    const id = String(row.id);
    byId.set(id, [...(byId.get(id) ?? []), row]);
  }
  return [...byId.values()].flatMap((group) => {
    const first = group[0];
    if (!first) return [];
    const sorted = [...group].sort((x, y) => x.epoch - y.epoch);
    const cells = first.cells.map((_, runIndex): RunCell => {
      const marks = sorted.map((row): EpochCell => ({
        epoch: row.epoch,
        key: row.key,
        mark: row.cells[runIndex]?.outcome ?? "missing",
      }));
      const count = (m: EpochMark) => marks.filter((c) => c.mark === m).length;
      const pass = count("pass");
      const scored = pass + count("fail");
      return { runIndex, marks, pass, scored, state: stateOf(pass, scored) };
    });
    return [
      {
        id: first.id,
        epochs: sorted.map((r) => r.epoch),
        cells,
        verdict: verdictOf(cells),
      },
    ];
  });
};

const kTier: Record<SampleVerdict["kind"], number> = {
  outlier: 0,
  split: 0,
  flaky: 1,
  "all-fail": 2,
  "no-data": 3,
  "all-pass": 4,
};

/** Disagreements first, then samples that flip between epochs; ties keep
 *  the input order. */
export const sortGridSamples = (rows: GridSampleRow[]): GridSampleRow[] =>
  rows
    .map((row, index) => ({ row, index }))
    .sort(
      (x, y) =>
        kTier[x.row.verdict.kind] - kTier[y.row.verdict.kind] ||
        x.index - y.index
    )
    .map(({ row }) => row);

/** The run a row click pairs with the baseline: the lone outlier, else the
 *  first run whose state differs from the baseline's, else the next run. */
export const compareTarget = (
  row: GridSampleRow,
  baseline: number
): number | undefined => {
  const { verdict } = row;
  if (verdict.kind === "outlier" && verdict.run !== baseline)
    return verdict.run;
  const baseState = row.cells[baseline]?.state;
  const differing = row.cells.find(
    (c) => c.runIndex !== baseline && c.state !== baseState
  );
  return (differing ?? row.cells.find((c) => c.runIndex !== baseline))
    ?.runIndex;
};

/** The epoch to open for a pair: the first where their marks differ. */
export const focusKey = (
  row: GridSampleRow,
  baseline: number,
  other: number
): string | undefined => {
  const a = row.cells[baseline]?.marks ?? [];
  const b = row.cells[other]?.marks ?? [];
  return (a.find((cell, i) => cell.mark !== b[i]?.mark) ?? a[0])?.key;
};
