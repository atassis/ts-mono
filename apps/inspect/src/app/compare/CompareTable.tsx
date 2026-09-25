import clsx from "clsx";
import { FC, useState } from "react";

import { ScoreValueDisplay } from "../samples/header-v2/ScoreValueDisplay";

import { AlignedSample, CompareCategory, inferScoreType } from "./alignRuns";
import { CategoryLegend } from "./CategoryLegend";
import styles from "./compare.module.css";

type Filter = "all" | "changed" | CompareCategory;

const kChanged = new Set<CompareCategory>([
  "improved",
  "regressed",
  "only-a",
  "only-b",
  "error",
]);
const kFilters: Filter[] = [
  "all",
  "changed",
  "improved",
  "regressed",
  "both-pass",
  "both-fail",
  "unchanged",
  "only-a",
  "only-b",
  "error",
];

const show = (filter: Filter, category: CompareCategory): boolean =>
  filter === "all" ||
  (filter === "changed" ? kChanged.has(category) : filter === category);

// Explicit map: typed CSS modules have no key for every category.
const kCategoryClass: Partial<Record<CompareCategory, string>> = {
  improved: styles.improved,
  regressed: styles.regressed,
  error: styles.error,
};

interface CompareTableProps {
  rows: AlignedSample[];
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
}

export const CompareTable: FC<CompareTableProps> = ({
  rows,
  selectedKey,
  onSelect,
}) => {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = rows.filter((r) => show(filter, r.category));
  const counts = new Map<CompareCategory, number>();
  for (const r of rows)
    counts.set(r.category, (counts.get(r.category) ?? 0) + 1);

  return (
    <div className={styles.tableWrap}>
      <div className={styles.filter}>
        <label>
          Show{" "}
          <select
            aria-label="Show"
            value={filter}
            onChange={(e) => {
              const next = kFilters.find((f) => f === e.target.value);
              setFilter(next ?? "all");
            }}
          >
            {kFilters.map((f) => (
              <option key={f} value={f}>
                {f}
                {f !== "all" && f !== "changed"
                  ? ` (${counts.get(f) ?? 0})`
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <CategoryLegend />
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Sample</th>
            <th>Epoch</th>
            <th>A</th>
            <th>B</th>
            <th>Δ</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr
              key={r.key}
              className={clsx(
                kCategoryClass[r.category],
                r.key === selectedKey && styles.selected
              )}
              aria-selected={r.key === selectedKey}
            >
              <td>
                <button
                  type="button"
                  className={styles.rowButton}
                  onClick={() => onSelect(r.key)}
                >
                  {String(r.id)}
                </button>
              </td>
              <td>{r.epoch}</td>
              <td>
                <ScoreValueDisplay
                  value={r.valueA}
                  scoreType={inferScoreType(r.valueA)}
                  size={14}
                />
              </td>
              <td>
                <ScoreValueDisplay
                  value={r.valueB}
                  scoreType={inferScoreType(r.valueB)}
                  size={14}
                />
              </td>
              <td>{r.delta === undefined ? "" : r.delta.toFixed(3)}</td>
              <td>{r.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
