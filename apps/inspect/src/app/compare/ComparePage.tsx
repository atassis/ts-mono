import { FC, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { ErrorPanel, LoadingBar } from "@tsmono/react/components";
import { useEventListener } from "@tsmono/react/hooks";

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
import { InfoButton } from "./InfoButton";
import { RunPicker } from "./RunPicker";
import {
  candidatesForB,
  sortRunsNewestFirst,
  tasksDiffer,
  taskVersionDiffers,
} from "./runPicker";
import { ScorerSelect } from "./ScorerSelect";
import { makeScrollSync } from "./scrollSync";
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
  const [syncScroll, setSyncScroll] = useState(true);
  const [scrollSync] = useState(makeScrollSync);
  const [sides, setSides] = useState<HTMLDivElement | null>(null);
  const paneA = useRef<HTMLDivElement>(null);
  const paneB = useRef<HTMLDivElement>(null);
  // The side scrolled last while unsynced; re-syncing snaps the other to it.
  const leader = useRef<"a" | "b">("a");

  const toggleSync = (on: boolean): void => {
    setSyncScroll(on);
    const [from, to] = leader.current === "a" ? [paneA, paneB] : [paneB, paneA];
    if (on && from.current && to.current)
      scrollSync.snap(from.current, to.current);
  };

  // Wheel input moves both panes in the same frame; following the other
  // pane's scroll event instead would lag it by a frame.
  useEventListener(
    sides,
    "wheel",
    (event) => {
      if (!syncScroll || !paneA.current || !paneB.current) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? paneA.current.clientHeight
            : 1;
      scrollSync.scrollBoth(paneA.current, paneB.current, event.deltaY * unit);
    },
    { passive: false }
  );

  const onPaneScroll = (side: "a" | "b"): void => {
    const [source, target] =
      side === "a"
        ? [paneA.current, paneB.current]
        : [paneB.current, paneA.current];
    if (!syncScroll) leader.current = side;
    if (source) scrollSync.onScroll(source, target, syncScroll);
  };

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
        {selected ? (
          <span className={styles.syncToggle}>
            <label className={styles.showAllTasks}>
              <input
                type="checkbox"
                checked={syncScroll}
                onChange={(e) => toggleSync(e.target.checked)}
              />
              Sync scroll
            </label>
            <InfoButton id="compare-sync-scroll-info" label="About sync scroll">
              <p className={styles.infoText}>
                Experimental. While on, A and B scroll by the same distance.
                Turning it back on lines the other side up with the one you
                scrolled last. Sides are not yet aligned by agent step, so
                matching steps can drift apart; this will improve.
              </p>
            </InfoButton>
          </span>
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
            <div ref={setSides} className={styles.sides}>
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
                    paneRef={paneA}
                    onScroll={() => onPaneScroll("a")}
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
                    paneRef={paneB}
                    onScroll={() => onPaneScroll("b")}
                  />
                ) : (
                  <div>not in B</div>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.placeholder}>Select a sample</div>
          )}
        </div>
      )}
    </div>
  );
};
