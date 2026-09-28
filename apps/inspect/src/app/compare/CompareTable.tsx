import clsx from "clsx";
import { FC, useState } from "react";

import { AlignedSample, parseSampleKey } from "./alignRuns";
import { CategoryLegend } from "./CategoryLegend";
import styles from "./compare.module.css";
import { EpochStrip } from "./EpochStrip";
import {
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

// Epochs mode compares one run against itself: A-vs-B categories like
// "improved"/"only-a" never occur, so only the categories that still mean
// something (all-pass, all-fail, errored) are offered.
const kFiltersEpochs: Filter[] = [
  "all",
  "flaky",
  "both-pass",
  "both-fail",
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

interface CompareTableProps {
  rows: AlignedSample[];
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
  /** Comparing two epochs of one run: one strip per sample instead of two,
   *  and marks pick an independent epoch for A/B instead of the row's
   *  single "sample" selection. */
  epochsMode?: boolean;
  epochA?: number;
  epochB?: number;
  onPickEpoch?: (epoch: number) => void;
}

export const CompareTable: FC<CompareTableProps> = ({
  rows,
  selectedKey,
  onSelect,
  epochsMode = false,
  epochA,
  epochB,
  onPickEpoch,
}) => {
  const filters = epochsMode ? kFiltersEpochs : kFilters;
  const [filter, setFilter] = useState<Filter>("all");
  const groups = sortGroups(groupBySample(rows));
  const visible = groups.filter((g) => show(filter, g));
  const count = (f: Filter): number => groups.filter((g) => show(f, g)).length;
  const onMarkSelect = (key: string): void =>
    epochsMode ? onPickEpoch?.(parseSampleKey(key).epoch) : onSelect(key);

  return (
    <div className={styles.tableWrap}>
      <div className={styles.filter}>
        <label>
          Show{" "}
          <select
            aria-label="Show"
            value={filter}
            onChange={(e) => {
              const next = filters.find((f) => f === e.target.value);
              setFilter(next ?? "all");
            }}
          >
            {filters.map((f) => (
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
            {epochsMode ? (
              <th>Epochs</th>
            ) : (
              <>
                <th>A</th>
                <th>B</th>
              </>
            )}
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
                  !epochsMode && kCategoryClass[g.category],
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
                {epochsMode ? (
                  <td>
                    <EpochStrip
                      label="Epoch"
                      cells={g.a}
                      pass={g.passA}
                      scored={g.scoredA}
                      selectedKey={selectedKey}
                      onSelect={onMarkSelect}
                      epochA={selected ? epochA : undefined}
                      epochB={selected ? epochB : undefined}
                    />
                  </td>
                ) : (
                  <>
                    <td>
                      <EpochStrip
                        label="A"
                        cells={g.a}
                        pass={g.passA}
                        scored={g.scoredA}
                        selectedKey={selectedKey}
                        onSelect={onMarkSelect}
                      />
                    </td>
                    <td>
                      <EpochStrip
                        label="B"
                        cells={g.b}
                        pass={g.passB}
                        scored={g.scoredB}
                        selectedKey={selectedKey}
                        onSelect={onMarkSelect}
                      />
                    </td>
                  </>
                )}
                <td>
                  {epochsMode ? `${g.passA}/${g.scoredA}` : g.category}
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
