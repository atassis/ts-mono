import { FC, useState } from "react";
import { useSearchParams } from "react-router";

import { ErrorPanel, LoadingBar } from "@tsmono/react/components";

import { useLogDir } from "../../app_config";
import { Log } from "../../client/api/types";
import { useLogListing, useLogsSync, useSampleSummaries } from "../../log_data";
import { ApplicationNavbar } from "../navbar/ApplicationNavbar";
import { ViewSegmentedControl } from "../navbar/ViewSegmentedControl";
import { logsUrl } from "../routing/url";
import { ScoreValueDisplay } from "../samples/header-v2/ScoreValueDisplay";

import {
  alignRuns,
  inferScoreType,
  resolveScorer,
  scorerOptions,
} from "./alignRuns";
import styles from "./compare.module.css";
import { CompareTable } from "./CompareTable";
import { RunPicker } from "./RunPicker";
import {
  candidatesForB,
  sortRunsNewestFirst,
  tasksDiffer,
  taskVersionDiffers,
} from "./runPicker";
import { ScorerSelect } from "./ScorerSelect";
import { SideTranscript } from "./SideTranscript";

const runIdentity = (log: Log | undefined): string =>
  [log?.model, log?.task].filter(Boolean).join(" · ");

export const ComparePage: FC = () => {
  const logDir = useLogDir();
  const [params, setParams] = useSearchParams();
  const a = params.get("a") ?? undefined;
  const b = params.get("b") ?? undefined;
  const selectedKey = params.get("sample") ?? undefined;
  const [showAllTasks, setShowAllTasks] = useState(false);

  // Kick off the dir listing sync — nothing else in this route mounts it,
  // unlike LogsPanel (its usual owner).
  const sync = useLogsSync(logDir, "");
  const logs = useLogListing(logDir);
  const summariesA = useSampleSummaries(logDir, a);
  const summariesB = useSampleSummaries(logDir, b);

  const update = (
    key: "a" | "b" | "sample" | "scorer",
    value: string
  ): void => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key === "a" || key === "b") next.delete("sample");
    setParams(next);
  };

  const rowsA = summariesA.data ?? [];
  const rowsB = summariesB.data ?? [];
  const scorers = scorerOptions(rowsA, rowsB);
  const scorer = resolveScorer(scorers, params.get("scorer") ?? undefined);
  const rows = a && b ? alignRuns(rowsA, rowsB, scorer) : [];
  const selected = rows.find((r) => r.key === selectedKey);

  const allRuns = sortRunsNewestFirst(logs.data ?? []);
  const logA = allRuns.find((log) => log.name === a);
  const logB = allRuns.find((log) => log.name === b);
  const bCandidates = candidatesForB(allRuns, logA, showAllTasks);
  const mismatchedTasks = tasksDiffer(logA, logB);
  const mismatchedVersions = taskVersionDiffers(logA, logB);

  const error = logs.error ?? summariesA.error ?? summariesB.error;
  // Both logs are picked but their samples haven't settled yet — without
  // this, the table briefly shows 0 rows, indistinguishable from "no data".
  const loading =
    !!(a && b) && (logs.loading || summariesA.loading || summariesB.loading);

  return (
    <div className={styles.page}>
      <ApplicationNavbar
        currentPath={undefined}
        fnNavigationUrl={logsUrl}
        loading={sync.busy || loading}
      >
        <ViewSegmentedControl selectedSegment="compare" />
      </ApplicationNavbar>
      <div className={styles.pickers}>
        <label className={styles.pickerLabel} htmlFor="compare-picker-a">
          <span className={styles.pickerLetter}>A</span>
          <RunPicker
            id="compare-picker-a"
            ariaLabel="Log A"
            logs={allRuns}
            logDir={logDir}
            selected={logA}
            onSelect={(log) => update("a", log.name)}
          />
        </label>
        <label className={styles.pickerLabel} htmlFor="compare-picker-b">
          <span className={styles.pickerLetter}>B</span>
          <RunPicker
            id="compare-picker-b"
            ariaLabel="Log B"
            logs={bCandidates}
            logDir={logDir}
            selected={logB}
            onSelect={(log) => update("b", log.name)}
            menuHeader={
              logA ? (
                <label className={styles.showAllTasks}>
                  <input
                    type="checkbox"
                    checked={showAllTasks}
                    onChange={(e) => setShowAllTasks(e.target.checked)}
                  />
                  Show all tasks
                </label>
              ) : undefined
            }
          />
        </label>
        {a && b && !loading ? (
          <ScorerSelect
            options={scorers}
            selected={scorer}
            onSelect={(name) => update("scorer", name)}
          />
        ) : null}
        {mismatchedTasks ? (
          <span role="alert" className={styles.warning}>
            different tasks — samples won&apos;t align
          </span>
        ) : mismatchedVersions ? (
          <span role="alert" className={styles.warning}>
            same task, different task_version — samples may not align
          </span>
        ) : null}
      </div>
      {error ? (
        <ErrorPanel
          title="Error"
          error={{ message: error.message, stack: error.stack }}
        />
      ) : loading ? (
        <div className={styles.loading}>
          <LoadingBar loading />
          Loading samples…
        </div>
      ) : (
        <div className={styles.body}>
          <CompareTable
            rows={rows}
            selectedKey={selectedKey}
            onSelect={(key) => update("sample", key)}
          />
          {!a || !b ? (
            <div className={styles.placeholder}>Pick a log for A and B</div>
          ) : selected ? (
            <>
              <div className={styles.side}>
                <div className={styles.sideHeader}>
                  A · {runIdentity(logA)} ·{" "}
                  <ScoreValueDisplay
                    value={selected.valueA}
                    scoreType={inferScoreType(selected.valueA)}
                  />
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
                  B · {runIdentity(logB)} ·{" "}
                  <ScoreValueDisplay
                    value={selected.valueB}
                    scoreType={inferScoreType(selected.valueB)}
                  />
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
            <div className={styles.placeholder}>Select a sample</div>
          )}
        </div>
      )}
    </div>
  );
};
