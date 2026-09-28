import { FC } from "react";

import { ScorerOption } from "./alignRuns";
import styles from "./compare.module.css";

interface ScorerSelectProps {
  options: ScorerOption[];
  selected: string | undefined;
  onSelect: (name: string) => void;
}

const optionLabel = (option: ScorerOption): string =>
  option.inA && option.inB
    ? option.name
    : `${option.name} (only in ${option.inA ? "A" : "B"})`;

export const ScorerSelect: FC<ScorerSelectProps> = ({
  options,
  selected,
  onSelect,
}) => {
  if (options.length === 0) return null;
  return (
    <label className={styles.scorer}>
      Scorer
      <select value={selected ?? ""} onChange={(e) => onSelect(e.target.value)}>
        {selected === undefined ? (
          <option value="" disabled>
            —
          </option>
        ) : null}
        {options.map((option) => (
          <option
            key={option.name}
            value={option.name}
            disabled={!(option.inA && option.inB)}
          >
            {optionLabel(option)}
          </option>
        ))}
      </select>
      {selected === undefined ? (
        <span role="alert" className={styles.warning}>
          no scorer in common — nothing to compare
        </span>
      ) : null}
    </label>
  );
};
