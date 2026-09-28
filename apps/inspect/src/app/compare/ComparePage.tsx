import { FC, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { type TranscriptViewNodesHandle } from "@tsmono/inspect-components/transcript";
import { ErrorPanel, LoadingBar } from "@tsmono/react/components";
import { navigateAndForget, useEventListener } from "@tsmono/react/hooks";

import { useLogDir } from "../../app_config";
import { Log } from "../../client/api/types";
import {
  useEvalSampleData,
  useLogListing,
  useLogsSync,
  useSampleSummaries,
} from "../../log_data";
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
import { AnchorOffsets, makeAnchorSync } from "./anchorSync";
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
import { SideTranscript } from "./SideTranscript";
import { alignAnchors, anchorsOf, StepAnchor } from "./stepAnchors";

const runIdentity = (log: Log | undefined): string =>
  [log?.model, log?.task].filter(Boolean).join(" · ");

// Scroll offset of each anchor's row, or undefined when the row is hidden
// inside a collapsed group.
const rowOffsets = (
  view: TranscriptViewNodesHandle | null,
  anchors: StepAnchor[]
): (number | undefined)[] => {
  const nodes = view?.getFlattenedNodes() ?? [];
  const rowOf = new Map(nodes.map((node, index) => [node.id, index]));
  return anchors.map((anchor) => {
    const row = rowOf.get(anchor.eventId ?? `event_index_${anchor.eventIndex}`);
    return row === undefined ? undefined : view?.getOffsetForIndex(row);
  });
};

const scrollMax = (pane: HTMLElement): number =>
  Math.max(0, pane.scrollHeight - pane.clientHeight);

/** Offsets of the paired anchors both panes can currently locate, kept
 *  strictly in order, framed by the start and end of each pane. */
const anchorOffsets = (
  paneA: HTMLElement,
  paneB: HTMLElement,
  offsetsA: (number | undefined)[],
  offsetsB: (number | undefined)[]
): AnchorOffsets => {
  const a = [0];
  const b = [0];
  offsetsA.forEach((x, i) => {
    const y = offsetsB[i];
    if (x === undefined || y === undefined) return;
    if (x <= (a.at(-1) ?? 0) || y <= (b.at(-1) ?? 0)) return;
    if (x >= scrollMax(paneA) || y >= scrollMax(paneB)) return;
    a.push(x);
    b.push(y);
  });
  a.push(Math.max(scrollMax(paneA), a.at(-1) ?? 0));
  b.push(Math.max(scrollMax(paneB), b.at(-1) ?? 0));
  return { a, b };
};

export const ComparePage: FC = () => {
  const logDir = useLogDir();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const a = params.get("a") ?? undefined;
  const b = params.get("b") ?? undefined;
  const selectedKey = params.get("sample") ?? undefined;
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [syncScroll, setSyncScroll] = useState(true);
  const [anchorSync] = useState(makeAnchorSync);
  const [sides, setSides] = useState<HTMLDivElement | null>(null);
  const paneA = useRef<HTMLDivElement>(null);
  const paneB = useRef<HTMLDivElement>(null);
  const viewA = useRef<TranscriptViewNodesHandle>(null);
  const viewB = useRef<TranscriptViewNodesHandle>(null);
  // The side scrolled last while unsynced; re-syncing snaps the other to it.
  const leader = useRef<"a" | "b">("a");

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
  const sampleA = useEvalSampleData(
    logDir,
    selected?.a && a
      ? { id: selected.id, epoch: selected.epoch, logFile: a }
      : undefined
  );
  const sampleB = useEvalSampleData(
    logDir,
    selected?.b && b
      ? { id: selected.id, epoch: selected.epoch, logFile: b }
      : undefined
  );
  const anchorsA = anchorsOf(sampleA.sample?.events ?? []);
  const anchorsB = anchorsOf(sampleB.sample?.events ?? []);
  const pairs = alignAnchors(anchorsA, anchorsB);
  const pairedA = pairs.flatMap((p) => anchorsA[p.a] ?? []);
  const pairedB = pairs.flatMap((p) => anchorsB[p.b] ?? []);

  // Offsets are read fresh on every scroll: rows get measured and groups
  // expand or collapse, which moves the anchors.
  const currentOffsets = (): AnchorOffsets | undefined => {
    if (!paneA.current || !paneB.current) return undefined;
    return anchorOffsets(
      paneA.current,
      paneB.current,
      rowOffsets(viewA.current, pairedA),
      rowOffsets(viewB.current, pairedB)
    );
  };

  const toggleSync = (on: boolean): void => {
    setSyncScroll(on);
    const offsets = currentOffsets();
    if (on && offsets && paneA.current && paneB.current)
      anchorSync.snap(leader.current, paneA.current, paneB.current, offsets);
  };

  // Wheel input moves both panes in the same frame; following the other
  // pane's scroll event instead would lag it by a frame.
  useEventListener(
    sides,
    "wheel",
    (event) => {
      const offsets = currentOffsets();
      if (!syncScroll || !offsets || !paneA.current || !paneB.current) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (!(event.target instanceof Node)) return;
      event.preventDefault();
      const driver = paneB.current.contains(event.target) ? "b" : "a";
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? paneA.current.clientHeight
            : 1;
      anchorSync.wheel(
        driver,
        paneA.current,
        paneB.current,
        event.deltaY * unit,
        offsets
      );
    },
    { passive: false }
  );

  const onPaneScroll = (side: "a" | "b"): void => {
    if (!syncScroll) leader.current = side;
    const offsets = currentOffsets();
    if (offsets && paneA.current && paneB.current)
      anchorSync.scrolled(
        side,
        paneA.current,
        paneB.current,
        offsets,
        syncScroll
      );
  };

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
        {a && b ? (
          <button
            type="button"
            className={styles.moreRuns}
            onClick={() => {
              const grid = new URLSearchParams([
                ["run", a],
                ["run", b],
              ]);
              navigateAndForget(navigate, `/compare/grid?${grid.toString()}`);
            }}
          >
            + more runs
          </button>
        ) : null}
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
                Experimental. Matching agent steps pass the top of both sides
                together; where one side has more to read, the other slows down
                or waits at its step. Turning sync back on lines the other side
                up with the one you scrolled last.
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
                    viewNodesRef={viewA}
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
                    viewNodesRef={viewB}
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
