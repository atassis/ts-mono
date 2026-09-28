import clsx from "clsx";
import { FC, useState } from "react";

import { formatPrettyDecimal } from "@tsmono/util";

import { Log } from "../../client/api/types";

import { EpochStrip } from "./EpochStrip";
import {
  compareTarget,
  focusKey,
  GridSampleRow,
  SampleVerdict,
} from "./gridGroups";
import styles from "./RunsGrid.module.css";
import { shortRunLabel } from "./shortRunLabel";

/** Accuracy ± stderr as Inspect itself computed them for this scorer. */
const runMetric = (
  log: Log | undefined,
  scorer: string | undefined
): string | undefined => {
  const score = log?.header?.results?.scores.find((s) => s.name === scorer);
  const value = score?.metrics.accuracy?.value ?? log?.primary_metric?.value;
  if (value === undefined) return undefined;
  const stderr = score?.metrics.stderr?.value;
  return stderr === undefined
    ? formatPrettyDecimal(value)
    : `${formatPrettyDecimal(value)} ± ${formatPrettyDecimal(stderr)}`;
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

interface RunsGridProps {
  runs: (Log | undefined)[];
  rows: GridSampleRow[];
  scorer: string | undefined;
  baselineIndex: number;
  onSelectBaseline: (index: number) => void;
  onRemoveRun: (index: number) => void;
  /** Open `key` (a sample epoch) side by side: baseline vs run `other`. */
  onOpen: (other: number, key: string) => void;
}

/**
 * Samples x runs, one row per sample with each run's epochs as marks.
 * Rows where every run passes every epoch are folded away by default.
 */
export const RunsGrid: FC<RunsGridProps> = ({
  runs,
  rows,
  scorer,
  baselineIndex,
  onSelectBaseline,
  onRemoveRun,
  onOpen,
}) => {
  const [showAgreeing, setShowAgreeing] = useState(false);
  const allModels = runs
    .map((run) => run?.model)
    .filter((m): m is string => Boolean(m));
  const name = (i: number): string => shortRunLabel(runs[i], allModels);
  const agreeing = rows.filter((r) => r.verdict.kind === "all-pass");
  const visible = showAgreeing
    ? rows
    : rows.filter((r) => r.verdict.kind !== "all-pass");

  const openRow = (row: GridSampleRow, preferred?: number): void => {
    const other =
      preferred !== undefined && preferred !== baselineIndex
        ? preferred
        : compareTarget(row, baselineIndex);
    if (other === undefined) return;
    const key = focusKey(row, baselineIndex, other);
    if (key) onOpen(other, key);
  };

  return (
    <table className={styles.grid}>
      <thead>
        <tr>
          <th className={styles.corner}>Sample</th>
          {runs.map((run, i) => (
            <th key={i} className={styles.runHeader}>
              <div className={styles.runTitle}>
                <button
                  type="button"
                  className={clsx(
                    styles.runName,
                    i === baselineIndex && styles.baseline
                  )}
                  aria-pressed={i === baselineIndex}
                  title={`${run?.model ?? ""}\nClick to make this the baseline`}
                  onClick={() => onSelectBaseline(i)}
                >
                  {name(i)}
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${name(i)}`}
                  onClick={() => onRemoveRun(i)}
                >
                  ×
                </button>
              </div>
              <div className={styles.runMeta}>
                {i === baselineIndex ? (
                  <span className={styles.baselineTag}>baseline</span>
                ) : null}
                {runMetric(run, scorer)}
              </div>
            </th>
          ))}
          <th className={styles.verdictHeader}>Outcome</th>
        </tr>
      </thead>
      <tbody>
        {visible.map((row) => (
          <tr key={String(row.id)} className={kVerdictClass[row.verdict.kind]}>
            <td>
              <button
                type="button"
                className={styles.rowButton}
                onClick={() => openRow(row)}
              >
                {String(row.id)}
              </button>
            </td>
            {row.cells.map((cell) => (
              <td key={cell.runIndex} className={styles.cell}>
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
            ))}
            <td className={styles.verdict}>{verdictText(row.verdict, name)}</td>
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
  );
};
