import clsx from "clsx";
import { FC, useState } from "react";

import { formatNumber, formatPrettyDecimal, formatTime } from "@tsmono/util";

import { Log, SampleSummary } from "../../client/api/types";

import { EpochStrip } from "./EpochStrip";
import { FailureBreakdownBar } from "./FailureBreakdownBar";
import { columnOrderByAccuracy, defaultColumnOrder } from "./gridColumns";
import {
  compareTarget,
  focusKey,
  GridSampleRow,
  SampleVerdict,
  sortGridSamples,
  sortGridSamplesByDifficulty,
} from "./gridGroups";
import { heatAlpha } from "./heatmap";
import { buildRunProfile, RunProfile } from "./runProfile";
import styles from "./RunsGrid.module.css";
import { shortRunLabel } from "./shortRunLabel";

const accuracyText = (profile: RunProfile): string | undefined => {
  if (profile.accuracy === undefined) return undefined;
  return profile.stderr === undefined
    ? formatPrettyDecimal(profile.accuracy)
    : `${formatPrettyDecimal(profile.accuracy)} ± ${formatPrettyDecimal(profile.stderr)}`;
};

const verdictText = (
  verdict: SampleVerdict,
  name: (runIndex: number) => string
): string => {
  switch (verdict.kind) {
    case "all-pass":
      return "all pass";
    case "all-fail":
      return "no run solves it: check the task or scorer";
    case "outlier":
      return `only ${name(verdict.run)} ${verdict.direction === "fails" ? "fails" : "passes"}`;
    case "split":
      return `split: ${verdict.pass} pass, ${verdict.fail} fail${verdict.mixed ? `, ${verdict.mixed} flaky` : ""}`;
    case "flaky":
      return `flaky in ${verdict.runs.map(name).join(", ")}; the rest agree`;
    case "no-data":
      return "—";
  }
};

const kVerdictClass: Partial<Record<SampleVerdict["kind"], string>> = {
  outlier: styles.outlier,
  split: styles.split,
  "all-fail": styles.allFail,
};

type OrderMode = "disagreement" | "difficulty";

// columnOrder is a permutation of valid run indices, so profiles[runIndex]
// is always in range; this fallback only satisfies noUncheckedIndexedAccess.
const emptyProfile: RunProfile = {
  breakdown: { pass: 0, fail: 0, limit: 0, error: 0, other: 0, total: 0 },
};

interface RunsGridProps {
  runs: (Log | undefined)[];
  /** Grouped but unsorted — RunsGrid picks the row/column order from
   *  `orderMode`, so the caller doesn't have to know about it. */
  rows: GridSampleRow[];
  /** One run's sample-epoch summaries per column, in `runs` order — cheap
   *  inputs for the per-column profile (median tokens/time, breakdown). */
  sampleLists: SampleSummary[][];
  scorer: string | undefined;
  baselineIndex: number;
  onSelectBaseline: (index: number) => void;
  onRemoveRun: (index: number) => void;
  /** Open `key` (a sample epoch) side by side: baseline vs run `other`. */
  onOpen: (other: number, key: string) => void;
}

/**
 * Samples x runs, one row per sample with each run's epochs as marks plus
 * a per-run profile (accuracy, median cost, failure breakdown). Rows where
 * every run passes every epoch are folded away by default.
 */
export const RunsGrid: FC<RunsGridProps> = ({
  runs,
  rows,
  sampleLists,
  scorer,
  baselineIndex,
  onSelectBaseline,
  onRemoveRun,
  onOpen,
}) => {
  const [showAgreeing, setShowAgreeing] = useState(false);
  const [orderMode, setOrderMode] = useState<OrderMode>("disagreement");
  const [heatmap, setHeatmap] = useState(false);

  const profiles = runs.map((run, i) =>
    buildRunProfile(run, sampleLists[i] ?? [], scorer)
  );
  const columnOrder =
    orderMode === "difficulty"
      ? columnOrderByAccuracy(profiles.map((p) => p.accuracy))
      : defaultColumnOrder(runs.length);
  const orderedRows =
    orderMode === "difficulty"
      ? sortGridSamplesByDifficulty(rows)
      : sortGridSamples(rows);

  const allModels = runs
    .map((run) => run?.model)
    .filter((m): m is string => Boolean(m));
  const name = (i: number): string => shortRunLabel(runs[i], allModels);
  const agreeing = orderedRows.filter((r) => r.verdict.kind === "all-pass");
  const visible = showAgreeing
    ? orderedRows
    : orderedRows.filter((r) => r.verdict.kind !== "all-pass");

  const openRow = (row: GridSampleRow, preferred?: number): void => {
    const other =
      preferred !== undefined && preferred !== baselineIndex
        ? preferred
        : compareTarget(row, baselineIndex);
    if (other === undefined) return;
    const key = focusKey(row, baselineIndex, other);
    if (key) onOpen(other, key);
  };

  const heatmapStyle = (
    pass: number,
    scored: number
  ): { backgroundColor: string } | undefined => {
    if (!heatmap || scored === 0) return undefined;
    return {
      backgroundColor: `rgba(var(--bs-success-rgb), ${heatAlpha(pass / scored)})`,
    };
  };

  return (
    <div>
      <div className={styles.toolbar}>
        <div
          className={styles.legend}
          title="Same colors and glyphs as the epoch marks"
        >
          <span className={clsx(styles.legendItem, styles.legendPass)}>
            ● pass
          </span>
          <span className={clsx(styles.legendItem, styles.legendFail)}>
            ✕ wrong answer
          </span>
          <span className={clsx(styles.legendItem, styles.legendLimit)}>
            ▲ hit a limit
          </span>
          <span className={clsx(styles.legendItem, styles.legendError)}>
            ! infra error
          </span>
        </div>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={heatmap}
            onChange={(e) => setHeatmap(e.target.checked)}
          />
          Heatmap (pass share)
        </label>
        <div
          className={styles.orderToggle}
          role="group"
          aria-label="Row and column order"
        >
          <button
            type="button"
            className={clsx(
              styles.orderButton,
              orderMode === "disagreement" && styles.orderButtonActive
            )}
            aria-pressed={orderMode === "disagreement"}
            onClick={() => setOrderMode("disagreement")}
          >
            Disagreements first
          </button>
          <button
            type="button"
            className={clsx(
              styles.orderButton,
              orderMode === "difficulty" && styles.orderButtonActive
            )}
            aria-pressed={orderMode === "difficulty"}
            onClick={() => setOrderMode("difficulty")}
          >
            Hardest first
          </button>
        </div>
      </div>
      <table className={styles.grid}>
        <thead>
          <tr>
            <th className={styles.corner}>Sample</th>
            {columnOrder.map((runIndex) => {
              const run = runs[runIndex];
              const profile = profiles[runIndex] ?? emptyProfile;
              return (
                <th key={runIndex} className={styles.runHeader}>
                  <div className={styles.runTitle}>
                    <button
                      type="button"
                      className={clsx(
                        styles.runName,
                        runIndex === baselineIndex && styles.baseline
                      )}
                      aria-pressed={runIndex === baselineIndex}
                      title={`${run?.model ?? ""}\nClick to make this the baseline`}
                      onClick={() => onSelectBaseline(runIndex)}
                    >
                      {name(runIndex)}
                    </button>
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Remove ${name(runIndex)}`}
                      onClick={() => onRemoveRun(runIndex)}
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.runMeta}>
                    {runIndex === baselineIndex ? (
                      <span className={styles.baselineTag}>baseline</span>
                    ) : null}
                    {accuracyText(profile)}
                    {profile.medianTokens !== undefined ||
                    profile.medianTime !== undefined ? (
                      <span className={styles.runStats}>
                        {profile.medianTokens !== undefined
                          ? ` · ${formatNumber(Math.round(profile.medianTokens))} tok`
                          : ""}
                        {profile.medianTime !== undefined
                          ? ` · ${formatTime(profile.medianTime)}`
                          : ""}
                        {" median"}
                      </span>
                    ) : null}
                  </div>
                  <FailureBreakdownBar breakdown={profile.breakdown} />
                </th>
              );
            })}
            <th className={styles.verdictHeader}>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr
              key={String(row.id)}
              className={kVerdictClass[row.verdict.kind]}
            >
              <td>
                <button
                  type="button"
                  className={styles.rowButton}
                  onClick={() => openRow(row)}
                >
                  {String(row.id)}
                </button>
              </td>
              {columnOrder.map((runIndex) => {
                const cell = row.cells[runIndex];
                if (!cell) return <td key={runIndex} className={styles.cell} />;
                return (
                  <td
                    key={runIndex}
                    className={styles.cell}
                    style={heatmapStyle(cell.pass, cell.scored)}
                  >
                    <EpochStrip
                      label={name(cell.runIndex)}
                      cells={cell.marks}
                      pass={cell.pass}
                      scored={cell.scored}
                      selectedKey={undefined}
                      onSelect={(key) => {
                        const other =
                          cell.runIndex === baselineIndex
                            ? compareTarget(row, baselineIndex)
                            : cell.runIndex;
                        if (other !== undefined) onOpen(other, key);
                      }}
                    />
                  </td>
                );
              })}
              <td className={styles.verdict}>
                {verdictText(row.verdict, name)}
              </td>
            </tr>
          ))}
          {agreeing.length > 0 ? (
            <tr>
              <td colSpan={runs.length + 2} className={styles.fold}>
                <button
                  type="button"
                  className={styles.foldButton}
                  onClick={() => setShowAgreeing((v) => !v)}
                >
                  {showAgreeing
                    ? `Hide the ${agreeing.length} samples every run passes`
                    : `${agreeing.length} more samples: every run passes every epoch (show)`}
                </button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
};
