import { FC, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { ErrorPanel, LoadingBar } from "@tsmono/react/components";
import { navigateAndForget } from "@tsmono/react/hooks";

import { useLogDir } from "../../app_config";
import {
  useLogListing,
  useLogsSync,
  useSampleSummariesMany,
} from "../../log_data";
import { ApplicationNavbar } from "../navbar/ApplicationNavbar";
import { ViewSegmentedControl } from "../navbar/ViewSegmentedControl";
import { logsUrl } from "../routing/url";

import { alignRunsGrid, firstCommonScorerN } from "./alignRunsGrid";
import { groupGridBySample } from "./gridGroups";
import { RunPicker } from "./RunPicker";
import { sortRunsNewestFirst } from "./runPicker";
import { RunsGrid } from "./RunsGrid";
import styles from "./RunsGridPage.module.css";

const kRunParam = "run";

const pairwiseUrl = (
  a: string,
  b: string,
  sample: string | undefined
): string => {
  const params = new URLSearchParams({ a, b });
  if (sample) params.set("sample", sample);
  return `/compare?${params.toString()}`;
};

/**
 * N-run overview: samples x runs, sorted by disagreement. A prototype for
 * the "which of these differences is real" question — see
 * notes/design-note.md section 7.6. Reuses the pairwise page's alignment
 * and score semantics (`alignRuns.ts`) generalized to N runs, and hands
 * off to that existing page for the actual transcript diff.
 */
export const RunsGridPage: FC = () => {
  const logDir = useLogDir();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const runNames = params.getAll(kRunParam);
  const [baselineIndex, setBaselineIndex] = useState(0);

  const sync = useLogsSync(logDir, "");
  const logs = useLogListing(logDir);
  const summaries = useSampleSummariesMany(logDir, runNames);

  const allRuns = sortRunsNewestFirst(logs.data ?? []);
  const runLogs = runNames.map((name) =>
    allRuns.find((log) => log.name === name)
  );

  const addRun = (name: string): void => {
    const next = new URLSearchParams(params);
    next.append(kRunParam, name);
    setParams(next);
  };
  const removeRun = (index: number): void => {
    const next = new URLSearchParams(params);
    const all = next.getAll(kRunParam).filter((_, i) => i !== index);
    next.delete(kRunParam);
    for (const n of all) next.append(kRunParam, n);
    setParams(next);
    if (baselineIndex >= index && baselineIndex > 0)
      setBaselineIndex(baselineIndex - 1);
  };

  const refreshing =
    sync.busy || logs.loading || summaries.some((s) => s.loading);
  // Only a first load replaces the grid; refetches keep it on screen.
  const loading = refreshing && (!logs.data || summaries.some((s) => !s.data));
  const error = logs.error ?? summaries.find((s) => s.error)?.error;

  const sampleLists = summaries.map((s) => s.data ?? []);
  const scorer = firstCommonScorerN(sampleLists);
  const rows =
    runNames.length >= 2
      ? groupGridBySample(alignRunsGrid(sampleLists, scorer))
      : [];
  const task = runLogs.find((log) => log?.task)?.task;

  const openPair = (other: number, key: string): void => {
    const a = runNames[baselineIndex];
    const b = runNames[other];
    if (a && b) navigateAndForget(navigate, pairwiseUrl(a, b, key));
  };

  const addRunPicker = (
    <RunPicker
      id="runs-grid-picker-add"
      ariaLabel="Add run"
      logs={allRuns.filter((log) => !runNames.includes(log.name))}
      logDir={logDir}
      selected={undefined}
      onSelect={(l) => addRun(l.name)}
      placeholder="+ add run"
    />
  );

  return (
    <div className={styles.page}>
      <ApplicationNavbar
        currentPath={undefined}
        fnNavigationUrl={logsUrl}
        loading={refreshing}
      >
        <ViewSegmentedControl selectedSegment="compare" />
      </ApplicationNavbar>
      {runNames.length >= 2 ? (
        <div className={styles.caption}>
          <span className={styles.captionText}>
            {runNames.length} runs{task ? ` of ${task}` : ""}
            {scorer ? `, scored by ${scorer}` : ""}. Each cell shows a
            run&apos;s epochs (● pass, ✕ fail, ▲ limit, ! error) and how many
            it passed. Click a row or mark to open it side by side with the
            baseline.
          </span>
          {addRunPicker}
        </div>
      ) : null}
      {error ? (
        <ErrorPanel
          title="Error"
          error={{ message: error.message, stack: error.stack }}
        />
      ) : runNames.length < 2 ? (
        <div className={styles.hint}>
          <p>Pick runs of the same task to compare them side by side.</p>
          {addRunPicker}
        </div>
      ) : loading ? (
        <div className={styles.loading}>
          <LoadingBar loading />
          Loading samples…
        </div>
      ) : (
        <div className={styles.gridWrap}>
          <RunsGrid
            runs={runLogs}
            rows={rows}
            sampleLists={sampleLists}
            scorer={scorer}
            baselineIndex={baselineIndex}
            onSelectBaseline={setBaselineIndex}
            onRemoveRun={removeRun}
            onOpen={openPair}
          />
        </div>
      )}
    </div>
  );
};
