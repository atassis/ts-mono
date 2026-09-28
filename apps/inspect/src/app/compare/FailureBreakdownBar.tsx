import clsx from "clsx";
import { FC } from "react";

import compareStyles from "./compare.module.css";
import styles from "./FailureBreakdownBar.module.css";
import { FailureBreakdown } from "./runProfile";

type ScoredKind = "pass" | "fail" | "limit" | "error";

// Same glyph + color mapping as EpochStrip's marks (`compare.module.css`),
// so a run's breakdown never disagrees with its own epoch marks about what
// a color/glyph pair means.
const kSegments: {
  key: ScoredKind;
  glyph: string;
  barClass: string;
  countClass: string;
  label: string;
}[] = [
  {
    key: "pass",
    glyph: "●",
    barClass: styles.segPass,
    countClass: compareStyles.markPass,
    label: "pass",
  },
  {
    key: "fail",
    glyph: "✕",
    barClass: styles.segFail,
    countClass: compareStyles.markFail,
    label: "wrong answer",
  },
  {
    key: "limit",
    glyph: "▲",
    barClass: styles.segLimit,
    countClass: compareStyles.markLimit,
    label: "hit a limit",
  },
  {
    key: "error",
    glyph: "!",
    barClass: styles.segError,
    countClass: compareStyles.markError,
    label: "infra error",
  },
];

/** Compact stacked bar + counts for a run's outcomes: of the sample-epochs
 *  that didn't pass, how many were a wrong answer vs an infra failure
 *  (limit/error) — the same distinction `failureKind` draws so a
 *  regression can be read as "hit the limit" rather than "wrong answer". */
export const FailureBreakdownBar: FC<{ breakdown: FailureBreakdown }> = ({
  breakdown,
}) => {
  const scored = kSegments.reduce((sum, s) => sum + breakdown[s.key], 0);
  if (scored === 0) return null;
  const present = kSegments.filter((s) => breakdown[s.key] > 0);
  const title = present.map((s) => `${breakdown[s.key]} ${s.label}`).join(", ");

  return (
    <div className={styles.wrap} title={title}>
      <div className={styles.bar} role="img" aria-label={title}>
        {present.map((s) => (
          <span
            key={s.key}
            className={clsx(styles.segment, s.barClass)}
            style={{ flexGrow: breakdown[s.key] }}
          />
        ))}
      </div>
      <div className={styles.counts}>
        {present.map((s) => (
          <span key={s.key} className={clsx(styles.count, s.countClass)}>
            {s.glyph}
            {breakdown[s.key]}
          </span>
        ))}
      </div>
    </div>
  );
};
