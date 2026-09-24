import clsx from "clsx";
import { FC, useState } from "react";

import { valueAsString } from "../../utils/format";

import { AlignedSample, CompareCategory } from "./alignRuns";
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

const fmt = (value: AlignedSample["valueA"]): string =>
  value === undefined ? "—" : valueAsString(value);

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
      <label className={styles.filter}>
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
              {f !== "all" && f !== "changed" ? ` (${counts.get(f) ?? 0})` : ""}
            </option>
          ))}
        </select>
      </label>
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
                styles.row,
                kCategoryClass[r.category],
                r.key === selectedKey && styles.selected
              )}
              role="button"
              tabIndex={0}
              aria-pressed={r.key === selectedKey}
              onClick={() => onSelect(r.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(r.key);
                }
              }}
            >
              <td>{String(r.id)}</td>
              <td>{r.epoch}</td>
              <td>{fmt(r.valueA)}</td>
              <td>{fmt(r.valueB)}</td>
              <td>{r.delta === undefined ? "" : r.delta.toFixed(3)}</td>
              <td>{r.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
