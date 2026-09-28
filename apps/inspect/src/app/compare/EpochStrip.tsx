import clsx from "clsx";
import { FC } from "react";

import styles from "./compare.module.css";
import { EpochCell, EpochMark } from "./sampleGroups";

// Glyph shape carries the distinction as well as color, so pass/fail/limit/
// error stay readable without relying on hue alone (CVD, print, grayscale).
const kMark: Record<EpochMark, { glyph: string; className: string }> = {
  pass: { glyph: "●", className: styles.markPass },
  fail: { glyph: "✕", className: styles.markFail },
  limit: { glyph: "▲", className: styles.markLimit },
  error: { glyph: "!", className: styles.markError },
  other: { glyph: "?", className: styles.markOther },
  missing: { glyph: "·", className: styles.markMissing },
};

interface EpochStripProps {
  /** Names the run in each mark's accessible label ("A epoch 2: fail"). */
  label: string;
  cells: EpochCell[];
  pass: number;
  scored: number;
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
  /** Epochs mode: which epoch numbers the A/B panes currently show, badged
   *  on the matching mark. */
  epochA?: number;
  epochB?: number;
}

const pickLabel = (
  epoch: number,
  epochA: number | undefined,
  epochB: number | undefined
): string | undefined => {
  const isA = epoch === epochA;
  const isB = epoch === epochB;
  if (isA && isB) return "AB";
  if (isA) return "A";
  if (isB) return "B";
  return undefined;
};

export const EpochStrip: FC<EpochStripProps> = ({
  label,
  cells,
  pass,
  scored,
  selectedKey,
  onSelect,
  epochA,
  epochB,
}) => (
  <span className={styles.strip}>
    {cells.map((cell) => {
      const pick = pickLabel(cell.epoch, epochA, epochB);
      return (
        <button
          key={cell.key}
          type="button"
          className={clsx(
            styles.mark,
            kMark[cell.mark].className,
            cell.key === selectedKey && styles.markSelected,
            pick && styles.markPicked
          )}
          title={`${pick ? `${pick} · ` : ""}${label} epoch ${cell.epoch}: ${cell.mark}`}
          aria-label={`${pick ? `${pick} · ` : ""}${label} epoch ${cell.epoch}: ${cell.mark}`}
          onClick={() => onSelect(cell.key)}
        >
          {kMark[cell.mark].glyph}
          {pick ? <span className={styles.pickBadge}>{pick}</span> : null}
        </button>
      );
    })}
    <span className={styles.tally}>
      {pass}/{scored}
    </span>
  </span>
);
