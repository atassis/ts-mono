import { FC } from "react";
import { useSearchParams } from "react-router";

import { useLogDir } from "../../app_config";
import { Log } from "../../client/api/types";
import { useLogListing, useLogsSync, useSampleSummaries } from "../../log_data";
import { valueAsString } from "../../utils/format";

import { alignRuns, firstCommonScorer } from "./alignRuns";
import styles from "./compare.module.css";
import { CompareTable } from "./CompareTable";
import { SideTranscript } from "./SideTranscript";

// logDir may not end with "/"; the listing's names are full URLs, so this is
// display only (log pickers still key on `log.name` verbatim).
const relativeLabel = (log: Log, logDir: string): string => {
  const withSlash = logDir.endsWith("/") ? logDir : `${logDir}/`;
  const path = log.name.startsWith(withSlash)
    ? log.name.slice(withSlash.length)
    : log.name;
  const suffix = [log.task, log.model].filter(Boolean).join(" · ");
  return suffix ? `${path} (${suffix})` : path;
};

export const ComparePage: FC = () => {
  const logDir = useLogDir();
  const [params, setParams] = useSearchParams();
  const a = params.get("a") ?? undefined;
  const b = params.get("b") ?? undefined;
  const selectedKey = params.get("sample") ?? undefined;

  // Kick off the dir listing sync — nothing else in this route mounts it,
  // unlike LogsPanel (its usual owner).
  useLogsSync(logDir, "");
  const logs = useLogListing(logDir);
  const summariesA = useSampleSummaries(logDir, a);
  const summariesB = useSampleSummaries(logDir, b);

  const update = (key: "a" | "b" | "sample", value: string): void => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== "sample") next.delete("sample");
    setParams(next);
  };

  const rowsA = summariesA.data ?? [];
  const rowsB = summariesB.data ?? [];
  const scorer = firstCommonScorer(rowsA, rowsB);
  const rows = a && b ? alignRuns(rowsA, rowsB, scorer) : [];
  const selected = rows.find((r) => r.key === selectedKey);

  const summaryError = summariesA.error ?? summariesB.error;

  const picker = (side: "a" | "b", value: string | undefined) => (
    <label>
      {side.toUpperCase()}{" "}
      <select
        aria-label={`Log ${side.toUpperCase()}`}
        value={value ?? ""}
        onChange={(e) => update(side, e.target.value)}
      >
        <option value="" disabled>
          choose a log…
        </option>
        {(logs.data ?? []).map((log) => (
          <option key={log.name} value={log.name}>
            {relativeLabel(log, logDir)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className={styles.page}>
      <div className={styles.pickers}>
        {picker("a", a)}
        {picker("b", b)}
        {scorer ? <span>scorer: {scorer}</span> : null}
      </div>
      <div className={styles.body}>
        <CompareTable
          rows={rows}
          selectedKey={selectedKey}
          onSelect={(key) => update("sample", key)}
        />
        {summaryError ? (
          <div>Error: {summaryError.message}</div>
        ) : !a || !b ? (
          <div>Pick a log for A and B</div>
        ) : selected ? (
          <>
            <div className={styles.side}>
              <div className={styles.sideHeader}>
                A ·{" "}
                {selected.valueA === undefined
                  ? "—"
                  : valueAsString(selected.valueA)}
              </div>
              {selected.a ? (
                <SideTranscript
                  logDir={logDir}
                  logFile={a}
                  id={selected.id}
                  epoch={selected.epoch}
                  side="a"
                />
              ) : (
                <div>not in A</div>
              )}
            </div>
            <div className={styles.side}>
              <div className={styles.sideHeader}>
                B ·{" "}
                {selected.valueB === undefined
                  ? "—"
                  : valueAsString(selected.valueB)}
              </div>
              {selected.b ? (
                <SideTranscript
                  logDir={logDir}
                  logFile={b}
                  id={selected.id}
                  epoch={selected.epoch}
                  side="b"
                />
              ) : (
                <div>not in B</div>
              )}
            </div>
          </>
        ) : (
          <div>Select a sample</div>
        )}
      </div>
    </div>
  );
};
