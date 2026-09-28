import clsx from "clsx";
import { FC, KeyboardEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useEventListener } from "@tsmono/react/hooks";
import { formatPrettyDecimal } from "@tsmono/util";

import { ApplicationIcons } from "../appearance/icons";

import { ScorerOption, ScorerStat } from "./alignRuns";
import compareStyles from "./compare.module.css";
import styles from "./RunPicker.module.css";

interface ScorerSelectProps {
  options: ScorerOption[];
  selected: string | undefined;
  onSelect: (name: string) => void;
}

const StatCell: FC<{
  stat: ScorerStat | undefined;
  side: "A" | "B";
  labelled?: boolean;
}> = ({ stat, side, labelled }) =>
  stat ? (
    <span className={styles.rowMetric}>
      {labelled ? <span className={styles.rowMuted}>{side} </span> : null}
      {stat.mean === undefined ? "—" : formatPrettyDecimal(stat.mean)}{" "}
      <span className={styles.rowMuted}>({stat.n})</span>
    </span>
  ) : (
    <span className={styles.rowMuted}>not in {side}</span>
  );

const ScorerRow: FC<{ option: ScorerOption; compact?: boolean }> = ({
  option,
  compact,
}) => (
  <span
    className={clsx(
      compareStyles.scorerBase,
      compact ? compareStyles.scorerCompact : compareStyles.scorerRow
    )}
  >
    <span className={styles.rowRun}>{option.name}</span>
    <StatCell stat={option.statA} side="A" labelled={compact} />
    <StatCell stat={option.statB} side="B" labelled={compact} />
  </span>
);

const comparable = (option: ScorerOption): boolean => option.inA && option.inB;

export const ScorerSelect: FC<ScorerSelectProps> = ({
  options,
  selected,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>();

  const current = options.find((o) => o.name === selected);

  const closeMenu = (): void => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const openMenu = (): void => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom, left: rect.left });
    const index = options.findIndex((o) => o.name === selected);
    setHighlighted(index >= 0 ? index : options.findIndex(comparable));
    setOpen(true);
  };

  useEventListener(document, "mousedown", (event) => {
    if (!open || !(event.target instanceof Node)) return;
    if (buttonRef.current?.contains(event.target)) return;
    if (menuRef.current?.contains(event.target)) return;
    closeMenu();
  });

  const commit = (option: ScorerOption | undefined): void => {
    if (!option || !comparable(option)) return;
    onSelect(option.name);
    closeMenu();
  };

  // Arrow keys skip the scorers only one run has; they can't be picked.
  const step = (from: number, delta: number): number => {
    for (let i = from + delta; i >= 0 && i < options.length; i += delta) {
      const option = options[i];
      if (option && comparable(option)) return i;
    }
    return from;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLUListElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => step(i, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => step(i, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(options[highlighted]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    }
  };

  if (options.length === 0) return null;

  return (
    <div className={compareStyles.scorer}>
      Scorer
      <div className={styles.container}>
        <button
          ref={buttonRef}
          type="button"
          aria-label="Scorer"
          aria-haspopup="listbox"
          aria-expanded={open}
          className={styles.trigger}
          onClick={() => (open ? closeMenu() : openMenu())}
        >
          {current ? (
            <ScorerRow option={current} compact />
          ) : (
            <span className={styles.placeholder}>—</span>
          )}
          <i className={clsx(ApplicationIcons.chevron.down, styles.chevron)} />
        </button>
        {open &&
          position &&
          createPortal(
            <div
              ref={menuRef}
              className={styles.menu}
              style={{ top: position.top, left: position.left }}
            >
              <div
                className={clsx(
                  compareStyles.scorerBase,
                  styles.header,
                  compareStyles.scorerRow
                )}
                aria-hidden
              >
                <span>Scorer</span>
                <span>A (n)</span>
                <span>B (n)</span>
              </div>
              <ul
                // Focus on mount: the list only exists once the menu opens
                // in response to a click.
                ref={(el) => el?.focus()}
                tabIndex={-1}
                role="listbox"
                aria-label="Scorer"
                className={styles.list}
                onKeyDown={handleKeyDown}
              >
                {options.map((option, index) => (
                  <li
                    key={option.name}
                    role="option"
                    aria-selected={option.name === selected}
                    aria-disabled={!comparable(option)}
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      disabled={!comparable(option)}
                      className={clsx(
                        styles.option,
                        index === highlighted && styles.highlighted,
                        option.name === selected && styles.selectedOption,
                        !comparable(option) && compareStyles.disabledOption
                      )}
                      onMouseEnter={() => {
                        if (comparable(option)) setHighlighted(index);
                      }}
                      onClick={() => commit(option)}
                    >
                      <ScorerRow option={option} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>,
            document.body
          )}
      </div>
      {selected === undefined ? (
        <span role="alert" className={compareStyles.warning}>
          no scorer in common — nothing to compare
        </span>
      ) : null}
    </div>
  );
};
