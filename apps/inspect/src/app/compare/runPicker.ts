import { Log } from "../../client/api/types";

// logDir may not end with "/"; the listing's names are full URLs, so this is
// display only (log pickers still key on `log.name` verbatim).
export const relativeLogPath = (log: Log, logDir: string): string => {
  const withSlash = logDir.endsWith("/") ? logDir : `${logDir}/`;
  return log.name.startsWith(withSlash)
    ? log.name.slice(withSlash.length)
    : log.name;
};

/** A run's name for display: its directory under the log dir, which is how
 *  repeated runs of one model (a/b tests, retries) are told apart. */
export const runDirLabel = (log: Log, logDir: string): string => {
  const path = relativeLogPath(log, logDir);
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash) : path.replace(/\.eval$/, "");
};

export interface RunProgress {
  done?: number;
  samples?: number;
  epochs: number;
}

export const runProgressOf = (log: Log): RunProgress => ({
  done: log.header?.sampleCount,
  samples: log.header?.eval.dataset.samples ?? undefined,
  epochs: log.header?.eval.config.epochs ?? 1,
});

export const formatRunProgress = ({
  done,
  samples,
  epochs,
}: RunProgress): string => {
  if (samples === undefined) return done === undefined ? "" : String(done);
  const total = samples * epochs;
  if (done !== undefined && done < total) return `${done}/${total}`;
  return epochs > 1 ? `${samples}×${epochs}` : String(samples);
};

const runTimestamp = (log: Log): number => {
  const t = log.started_at ?? log.completed_at;
  return t ? new Date(t).getTime() : 0;
};

export const sortRunsNewestFirst = (logs: Log[]): Log[] =>
  [...logs].sort((a, b) => runTimestamp(b) - runTimestamp(a));

// One combined lowercase haystack per run — model, task, relative path, and
// start date. A picker query's whitespace-separated terms are matched as
// substrings against this (AND across terms, not tied to a specific field).
export const runSearchHaystack = (log: Log, logDir: string): string =>
  [log.model, log.task, relativeLogPath(log, logDir), log.started_at]
    .filter((v): v is string => Boolean(v))
    .join(" ")
    .toLowerCase();

export const runMatchesQuery = (haystack: string, query: string): boolean => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((term) => haystack.includes(term));
};

// Until a log's header loads, the listing's task comes from the file name,
// where inspect writes "_" as "-" (agentic_repo -> agentic-repo).
const taskKey = (log: Log): string | undefined => log.task?.replace(/_/g, "-");

// B candidates are scoped to A's task unless the caller asked to see all
// tasks; with no A picked yet, every run is a valid B.
export const candidatesForB = (
  logs: Log[],
  a: Log | undefined,
  showAllTasks: boolean
): Log[] =>
  !a || showAllTasks ? logs : logs.filter((log) => taskKey(log) === taskKey(a));

// Strips whatever "/"-separated prefix every model in the list shares (e.g.
// "openai-api/gw/") so the picker shows the part that actually distinguishes
// runs — same-provider models like qwen3.5/3.6/3.8 otherwise render as an
// identical truncated string. Keeps at least one segment.
export const distinguishingModelLabel = (
  model: string,
  allModels: string[]
): string => {
  if (allModels.length < 2) return model;
  const [first, ...rest] = allModels.map((m) => m.split("/"));
  if (!first) return model;
  const minSegments = Math.min(first.length, ...rest.map((s) => s.length));
  let shared = 0;
  while (
    shared < minSegments - 1 &&
    rest.every((s) => s[shared] === first[shared])
  ) {
    shared++;
  }
  return shared > 0 ? model.split("/").slice(shared).join("/") : model;
};

export const tasksDiffer = (a: Log | undefined, b: Log | undefined): boolean =>
  !!a && !!b && taskKey(a) !== taskKey(b);

// Same task, but the task's source changed between runs — samples may not
// line up even though the task name matches.
export const taskVersionDiffers = (
  a: Log | undefined,
  b: Log | undefined
): boolean =>
  !!a &&
  !!b &&
  taskKey(a) === taskKey(b) &&
  a.task_version !== undefined &&
  b.task_version !== undefined &&
  a.task_version !== b.task_version;
