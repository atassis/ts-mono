import clsx from "clsx";
import { FC, useState } from "react";

import { AlignedSample } from "./alignRuns";
import { CategoryLegend } from "./CategoryLegend";
import styles from "./compare.module.css";
import {
  EpochCell,
  EpochMark,
  groupBySample,
  GroupCategory,
  SampleGroup,
  sortGroups,
} from "./sampleGroups";

type Filter = "all" | "changed" | "flaky" | GroupCategory;

const kFilters: Filter[] = [
  "all",
  "changed",
  "improved",
  "regressed",
  "flaky",
  "both-pass",
  "both-fail",
  "unchanged",
  "only-a",
  "only-b",
  "error",
];

const show = (filter: Filter, group: SampleGroup): boolean => {
  if (filter === "all") return true;
  if (filter === "flaky") return group.flaky;
  if (filter === "changed")
    return group.category === "improved" || group.category === "regressed";
  return group.category === filter;
};

// Explicit map: typed CSS modules have no key for every category.
const kCategoryClass: Partial<Record<GroupCategory, string>> = {
  improved: styles.improved,
  regressed: styles.regressed,
  error: styles.error,
};

const kMark: Record<EpochMark, { glyph: string; className: string }> = {
  pass: { glyph: "●", className: styles.markPass },
  fail: { glyph: "✕", className: styles.markFail },
  error: { glyph: "!", className: styles.markError },
  other: { glyph: "?", className: styles.markOther },
  missing: { glyph: "·", className: styles.markMissing },
};

interface EpochStripProps {
  side: "A" | "B";
  cells: EpochCell[];
  pass: number;
  scored: number;
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
}

const EpochStrip: FC<EpochStripProps> = ({
  side,
  cells,
  pass,
  scored,
  selectedKey,
  onSelect,
}) => (
  <span className={styles.strip}>
    {cells.map((cell) => (
      <button
        key={cell.key}
        type="button"
        className={clsx(
          styles.mark,
          kMark[cell.mark].className,
          cell.key === selectedKey && styles.markSelected
        )}
        title={`${side} epoch ${cell.epoch}: ${cell.mark}`}
        aria-label={`${side} epoch ${cell.epoch}: ${cell.mark}`}
        onClick={() => onSelect(cell.key)}
      >
        {kMark[cell.mark].glyph}
      </button>
    ))}
    <span className={styles.tally}>
      {pass}/{scored}
    </span>
  </span>
);

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
  const groups = sortGroups(groupBySample(rows));
  const visible = groups.filter((g) => show(filter, g));
  const count = (f: Filter): number => groups.filter((g) => show(f, g)).length;

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
                {f} ({count(f)})
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
            <th>A</th>
            <th>B</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((g) => {
            const selected = [...g.a, ...g.b].some(
              (c) => c.key === selectedKey
            );
            return (
              <tr
                key={String(g.id)}
                className={clsx(
                  kCategoryClass[g.category],
                  selected && styles.selected
                )}
                aria-selected={selected}
              >
                <td>
                  <button
                    type="button"
                    className={styles.rowButton}
                    onClick={() => onSelect(g.focusKey)}
                  >
                    {String(g.id)}
                  </button>
                </td>
                <td>
                  <EpochStrip
                    side="A"
                    cells={g.a}
                    pass={g.passA}
                    scored={g.scoredA}
                    selectedKey={selectedKey}
                    onSelect={onSelect}
                  />
                </td>
                <td>
                  <EpochStrip
                    side="B"
                    cells={g.b}
                    pass={g.passB}
                    scored={g.scoredB}
                    selectedKey={selectedKey}
                    onSelect={onSelect}
                  />
                </td>
                <td>
                  {g.category}
                  {g.flaky ? (
                    <span className={styles.flaky}> · flaky</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
