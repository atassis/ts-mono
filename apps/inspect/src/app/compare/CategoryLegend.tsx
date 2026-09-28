import clsx from "clsx";
import { FC, useState } from "react";

import { PopOver } from "@tsmono/react/components";

import { ApplicationIcons } from "../appearance/icons";

import styles from "./CategoryLegend.module.css";
import compareStyles from "./compare.module.css";

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
          {kLegend.map(({ label, swatch, meaning }) => (
            <li key={label} className={styles.item}>
              <span className={clsx(styles.swatch, swatch)} />
              <span className={styles.category}>{label}</span>
              <span className={styles.meaning}>{meaning}</span>
            </li>
          ))}
        </ul>
      </PopOver>
    </>
  );
};
