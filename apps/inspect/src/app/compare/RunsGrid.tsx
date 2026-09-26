import clsx from "clsx";
import { FC } from "react";

import { Log } from "../../client/api/types";
import { valueAsString } from "../../utils/format";

import { GridOutcome, GridRow } from "./alignRunsGrid";
import styles from "./RunsGrid.module.css";
import { shortRunLabel } from "./shortRunLabel";

const kOutcomeClass: Record<GridOutcome, string> = {
  pass: styles.pass,
  fail: styles.fail,
  other: styles.other,
  error: styles.error,
  missing: styles.missing,
};

const kOutcomeGlyph: Record<GridOutcome, string> = {
  pass: "✓",
  fail: "✗",
  other: "•",
  error: "!",
  missing: "",
};

interface RunsGridProps {
  runs: (Log | undefined)[];
  rows: GridRow[];
  baselineIndex: number;
  focusedKey: string | undefined;
  onSelectBaseline: (index: number) => void;
  onSelectCell: (row: GridRow, runIndex: number) => void;
  onSelectRow: (row: GridRow) => void;
}

/**
 * Samples x runs grid, sorted by the caller (see `sortByDisagreement`).
 * Coloring intentionally reuses the viewer's pass/fail/other tones — this
 * is an overview, not a new vocabulary; the disagreement pattern is
 * conveyed by the row summary and by clustering, not by color.
 */
export const RunsGrid: FC<RunsGridProps> = ({
  runs,
  rows,
  baselineIndex,
  focusedKey,
  onSelectBaseline,
  onSelectCell,
  onSelectRow,
}) => (
  <table className={styles.grid}>
    <thead>
      <tr>
        <th className={styles.cornerHeader}>sample</th>
        {runs.map((run, i) => (
          <th
            key={i}
            className={styles.runHeader}
            title={run?.model ?? run?.name}
          >
            <button
              type="button"
              className={clsx(
                styles.baselineButton,
                i === baselineIndex && styles.baselineActive
              )}
              onClick={() => onSelectBaseline(i)}
              aria-pressed={i === baselineIndex}
              title="Use as baseline for the pairwise view"
            >
              {shortRunLabel(run)}
            </button>
          </th>
        ))}
        <th className={styles.summaryHeader}>disagreement</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr
          key={row.key}
          className={clsx(row.key === focusedKey && styles.focusedRow)}
        >
          <td>
            <button
              type="button"
              className={styles.rowButton}
              onClick={() => onSelectRow(row)}
              title="Compare against the baseline"
            >
              {String(row.id)}
              {row.epoch > 1 ? ` #${row.epoch}` : ""}
            </button>
          </td>
          {row.cells.map((cell) => (
            <td key={cell.runIndex} className={styles.cell}>
              <button
                type="button"
                className={clsx(styles.cellButton, kOutcomeClass[cell.outcome])}
                onClick={() => onSelectCell(row, cell.runIndex)}
                disabled={cell.outcome === "missing"}
                title={
                  cell.value === undefined
                    ? cell.outcome
                    : `${cell.outcome}: ${valueAsString(cell.value)}`
                }
              >
                {kOutcomeGlyph[cell.outcome]}
              </button>
            </td>
          ))}
          <td
            className={clsx(
              styles.summaryCell,
              row.pattern === "outlier" && styles.patternOutlier,
              row.pattern === "split" && styles.patternSplit
            )}
          >
            {row.pattern === "no-data"
              ? "—"
              : `${Math.round(row.disagreement * 100)}%`}
            {row.pattern === "outlier"
              ? " (1 run)"
              : row.pattern === "split"
                ? " (split)"
                : ""}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);
