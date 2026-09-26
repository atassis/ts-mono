import { FC, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { ErrorPanel, LoadingBar } from "@tsmono/react/components";
import { navigateAndForget, useEventListener } from "@tsmono/react/hooks";

import { useLogDir } from "../../app_config";
import {
  useLogListing,
  useLogsSync,
  useSampleSummariesMany,
} from "../../log_data";
import { ApplicationNavbar } from "../navbar/ApplicationNavbar";
import { logsUrl } from "../routing/url";

import {
  alignRunsGrid,
  firstCommonScorerN,
  GridRow,
  rowCompareTarget,
  sortByDisagreement,
} from "./alignRunsGrid";
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
  const [comparedIndex, setComparedIndex] = useState<number | undefined>(
    undefined
  );
  const [focusedKey, setFocusedKey] = useState<string | undefined>(undefined);

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
  const replaceRun = (index: number, name: string): void => {
    const next = new URLSearchParams(params);
    const all = next.getAll(kRunParam);
    all[index] = name;
    next.delete(kRunParam);
    for (const n of all) next.append(kRunParam, n);
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

  const loading = sync.busy || logs.loading || summaries.some((s) => s.loading);
  const error = logs.error ?? summaries.find((s) => s.error)?.error;

  const sampleLists = summaries.map((s) => s.data ?? []);
  const scorer = firstCommonScorerN(sampleLists);
  const rows =
    runNames.length >= 2
      ? sortByDisagreement(alignRunsGrid(sampleLists, scorer))
      : [];

  const goToPairwise = (row: GridRow, otherIndex: number | undefined): void => {
    if (otherIndex === undefined) return;
    const a = runNames[baselineIndex];
    const b = runNames[otherIndex];
    if (!a || !b) return;
    navigateAndForget(navigate, pairwiseUrl(a, b, row.key));
  };

  useEventListener(window, "keydown", (event) => {
    if (rows.length === 0 || runNames.length < 2) return;
    const row = rows.find((r) => r.key === focusedKey) ?? rows[0];
    if (!row) return;
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      const others = row.cells
        .map((c) => c.runIndex)
        .filter((i) => i !== baselineIndex);
      const [firstOther] = others;
      if (firstOther === undefined) return;
      const current =
        comparedIndex ?? rowCompareTarget(row, baselineIndex) ?? firstOther;
      const at = others.indexOf(current);
      const nextAt =
        event.key === "]"
          ? (at + 1) % others.length
          : (at - 1 + others.length) % others.length;
      const next = others[nextAt];
      if (next === undefined) return;
      setFocusedKey(row.key);
      setComparedIndex(next);
    } else if (event.key === "Enter") {
      goToPairwise(row, comparedIndex ?? rowCompareTarget(row, baselineIndex));
    }
  });

  return (
    <div className={styles.page}>
      <ApplicationNavbar
        currentPath={undefined}
        fnNavigationUrl={logsUrl}
        loading={sync.busy || loading}
      />
      <div className={styles.pickers}>
        {runNames.map((_, i) => {
          const log = runLogs[i];
          return (
            <div key={i} className={styles.pickerSlot}>
              <RunPicker
                id={`runs-grid-picker-${i}`}
                ariaLabel={`Run ${i + 1}`}
                logs={allRuns}
                logDir={logDir}
                selected={log}
                onSelect={(l) => replaceRun(i, l.name)}
              />
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => removeRun(i)}
                aria-label={`Remove run ${i + 1}`}
              >
                ×
              </button>
            </div>
          );
        })}
        <RunPicker
          id="runs-grid-picker-add"
          ariaLabel="Add run"
          logs={allRuns.filter((log) => !runNames.includes(log.name))}
          logDir={logDir}
          selected={undefined}
          onSelect={(l) => addRun(l.name)}
        />
        {scorer ? (
          <span className={styles.scorer}>scorer: {scorer}</span>
        ) : null}
      </div>
      {error ? (
        <ErrorPanel
          title="Error"
          error={{ message: error.message, stack: error.stack }}
        />
      ) : runNames.length < 3 ? (
        <div className={styles.hint}>
          Pick 3 or more runs from the same log directory.
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
            baselineIndex={baselineIndex}
            focusedKey={focusedKey}
            onSelectBaseline={setBaselineIndex}
            onSelectCell={(row, runIndex) => {
              setFocusedKey(row.key);
              setComparedIndex(runIndex);
              goToPairwise(
                row,
                runIndex === baselineIndex ? undefined : runIndex
              );
            }}
            onSelectRow={(row) => {
              setFocusedKey(row.key);
              const target = rowCompareTarget(row, baselineIndex);
              setComparedIndex(target);
              goToPairwise(row, target);
            }}
          />
        </div>
      )}
    </div>
  );
};
