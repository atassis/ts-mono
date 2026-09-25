import clsx from "clsx";
import { FC, useState } from "react";

import { PopOver } from "@tsmono/react/components";

import { ApplicationIcons } from "../appearance/icons";

import { CompareCategory } from "./alignRuns";
import styles from "./CategoryLegend.module.css";
import compareStyles from "./compare.module.css";

const kLegend: Array<{
  category: CompareCategory;
  swatch: string | undefined;
  meaning: string;
}> = [
  {
    category: "both-pass",
    swatch: undefined,
    meaning: "passed in both A and B",
  },
  {
    category: "both-fail",
    swatch: undefined,
    meaning: "failed in both A and B",
  },
  {
    category: "improved",
    swatch: compareStyles.improved,
    meaning: "passed in A, failed in B (or score went up)",
  },
  {
    category: "regressed",
    swatch: compareStyles.regressed,
    meaning: "passed in A, failed in B (or score went down)",
  },
  {
    category: "unchanged",
    swatch: undefined,
    meaning: "present in both, score unchanged",
  },
  {
    category: "only-a",
    swatch: undefined,
    meaning: "sample present only in A",
  },
  {
    category: "only-b",
    swatch: undefined,
    meaning: "sample present only in B",
  },
  {
    category: "error",
    swatch: compareStyles.error,
    meaning: "sample errored in A and/or B",
  },
];

export const CategoryLegend: FC = () => {
  const [open, setOpen] = useState(false);
  const [buttonEl, setButtonEl] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={setButtonEl}
        type="button"
        aria-label="Category legend"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={styles.button}
        onClick={() => setOpen((v) => !v)}
      >
        <i className={ApplicationIcons.info} />
      </button>
      <PopOver
        id="compare-category-legend"
        isOpen={open}
        setIsOpen={setOpen}
        positionEl={buttonEl}
        placement="bottom-start"
        hoverDelay={0}
      >
        <ul className={styles.list}>
          {kLegend.map(({ category, swatch, meaning }) => (
            <li key={category} className={styles.item}>
              <span className={clsx(styles.swatch, swatch)} />
              <span className={styles.category}>{category}</span>
              <span className={styles.meaning}>{meaning}</span>
            </li>
          ))}
        </ul>
      </PopOver>
    </>
  );
};
