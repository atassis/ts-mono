import clsx from "clsx";
import { FC, KeyboardEvent, ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useEventListener } from "@tsmono/react/hooks";

import { EvalLogStatus } from "../../@types/extraInspect";
import { Log } from "../../client/api/types";
import { ApplicationIcons } from "../appearance/icons";

import {
  relativeLogPath,
  runMatchesQuery,
  runSearchHaystack,
} from "./runPicker";
import styles from "./RunPicker.module.css";

const statusIcon = (
  status: EvalLogStatus | undefined
): { icon: string; className: string } => {
  if (status === "error")
    return { icon: ApplicationIcons.error, className: styles.error };
  if (status === "started")
    return { icon: ApplicationIcons.running, className: styles.started };
  if (status === "cancelled")
    return { icon: ApplicationIcons.cancelled, className: styles.cancelled };
  return { icon: ApplicationIcons.success, className: styles.success };
};

const shortDate = (value: string | undefined): string => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("sv-SE");
};

interface RunRowProps {
  log: Log;
  logDir: string;
}

/** Dense one-line summary of a run, shared by the closed picker and its
 *  option list so the selected value reads identically either way. */
const RunRow: FC<RunRowProps> = ({ log, logDir }) => {
  const { icon, className } = statusIcon(log.status);
  const metric = log.primary_metric;
  return (
    <span className={styles.row}>
      <i className={clsx(icon, className, styles.rowIcon)} />
      <span className={styles.rowModel}>{log.model ?? "—"}</span>
      <span className={styles.rowTask}>
        {log.task ?? relativeLogPath(log, logDir)}
      </span>
      {metric ? (
        <span className={styles.rowMetric}>
          {metric.name}: {metric.value}
        </span>
      ) : null}
      {log.header?.sampleCount !== undefined ? (
        <span className={styles.rowMuted}>
          {log.header.sampleCount} samples
        </span>
      ) : null}
      <span className={styles.rowMuted}>{shortDate(log.started_at)}</span>
    </span>
  );
};

interface RunPickerProps {
  id: string;
  ariaLabel: string;
  logs: Log[];
  logDir: string;
  selected: Log | undefined;
  onSelect: (log: Log) => void;
  /** Rendered inside the open menu, above the option list (e.g. B's
   *  "show all tasks" toggle). */
  menuHeader?: ReactNode;
}

export const RunPicker: FC<RunPickerProps> = ({
  id,
  ariaLabel,
  logs,
  logDir,
  selected,
  onSelect,
  menuHeader,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const filtered = logs.filter((log) =>
    runMatchesQuery(runSearchHaystack(log, logDir), query)
  );

  const computePosition = (): void => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      top: rect.bottom,
      left: rect.left,
      width: Math.max(rect.width, 360),
    });
  };

  useEventListener(window, "resize", () => {
    if (open) computePosition();
  });

  const openMenu = (): void => {
    // Read the trigger's rect synchronously on click, before the portal
    // renders — no post-render effect needed for the initial position.
    computePosition();
    setQuery("");
    setHighlighted(0);
    setOpen(true);
  };

  const closeMenu = (): void => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const commitHighlighted = (): void => {
    const log = filtered[highlighted];
    if (log) {
      onSelect(log);
      closeMenu();
    }
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitHighlighted();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    }
  };

  return (
    <div className={styles.container}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={styles.trigger}
        onClick={() => (open ? closeMenu() : openMenu())}
      >
        {selected ? (
          <RunRow log={selected} logDir={logDir} />
        ) : (
          <span className={styles.placeholder}>choose a log…</span>
        )}
        <i className={clsx(ApplicationIcons.chevron.down, styles.chevron)} />
      </button>
      {open &&
        position &&
        createPortal(
          <>
            <div
              className={styles.backdrop}
              role="presentation"
              onClick={closeMenu}
            />
            <div
              className={styles.menu}
              style={{
                top: position.top,
                left: position.left,
                minWidth: position.width,
              }}
            >
              {menuHeader}
              <div className={styles.searchRow}>
                <i
                  className={clsx(ApplicationIcons.search, styles.searchIcon)}
                />
                <input
                  // Focus on mount: the input only exists once the menu opens
                  // in response to a click, so this is never a page-load
                  // autofocus.
                  ref={(el) => el?.focus()}
                  className={styles.searchInput}
                  type="text"
                  value={query}
                  placeholder="Filter by model, task, path, date…"
                  aria-label={`${ariaLabel} search`}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlighted(0);
                  }}
                  onKeyDown={handleInputKeyDown}
                />
              </div>
              <ul role="listbox" className={styles.list} aria-label={ariaLabel}>
                {filtered.length === 0 ? (
                  <li className={styles.empty}>No matching runs</li>
                ) : (
                  filtered.map((log, index) => (
                    <li
                      key={log.name}
                      role="option"
                      aria-selected={log.name === selected?.name}
                    >
                      <button
                        type="button"
                        className={clsx(
                          styles.option,
                          index === highlighted && styles.highlighted,
                          log.name === selected?.name && styles.selectedOption
                        )}
                        onMouseEnter={() => setHighlighted(index)}
                        onClick={() => {
                          onSelect(log);
                          closeMenu();
                        }}
                      >
                        <RunRow log={log} logDir={logDir} />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </>,
          document.body
        )}
    </div>
  );
};
