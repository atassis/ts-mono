import clsx from "clsx";
import { FC } from "react";

import styles from "./CategoryLegend.module.css";
import compareStyles from "./compare.module.css";
import { InfoButton } from "./InfoButton";

const kLegend: Array<{
  label: string;
  swatch: string | undefined;
  meaning: string;
}> = [
  {
    label: "both-pass",
    swatch: undefined,
    meaning: "every scored epoch passed, in A and in B",
  },
  {
    label: "both-fail",
    swatch: undefined,
    meaning: "every scored epoch failed, in A and in B",
  },
  {
    label: "improved",
    swatch: compareStyles.improved,
    meaning: "B passes a larger share of epochs than A",
  },
  {
    label: "regressed",
    swatch: compareStyles.regressed,
    meaning: "B passes a smaller share of epochs than A",
  },
  {
    label: "unchanged",
    swatch: undefined,
    meaning: "same pass share in A and B, but not all-pass or all-fail",
  },
  {
    label: "flaky",
    swatch: undefined,
    meaning:
      "passes in some epochs and fails in others within one run; a gap between A and B may be noise",
  },
  {
    label: "only-a",
    swatch: undefined,
    meaning: "sample present only in A",
  },
  {
    label: "only-b",
    swatch: undefined,
    meaning: "sample present only in B",
  },
  {
    label: "error",
    swatch: compareStyles.error,
    meaning: "no scored epoch on one side (all errored)",
  },
];

export const CategoryLegend: FC = () => (
  <InfoButton id="compare-category-legend" label="Category legend">
    <ul className={styles.list}>
      {kLegend.map(({ label, swatch, meaning }) => (
        <li key={label} className={styles.item}>
          <span className={clsx(styles.swatch, swatch)} />
          <span className={styles.category}>{label}</span>
          <span className={styles.meaning}>{meaning}</span>
        </li>
      ))}
    </ul>
  </InfoButton>
);
