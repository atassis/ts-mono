import { Log } from "../../client/api/types";

// logDir may not end with "/"; the listing's names are full URLs, so this is
// display only (log pickers still key on `log.name` verbatim).
export const relativeLogPath = (log: Log, logDir: string): string => {
  const withSlash = logDir.endsWith("/") ? logDir : `${logDir}/`;
  return log.name.startsWith(withSlash)
    ? log.name.slice(withSlash.length)
    : log.name;
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

// B candidates are scoped to A's task unless the caller asked to see all
// tasks; with no A picked yet, every run is a valid B.
export const candidatesForB = (
  logs: Log[],
  a: Log | undefined,
  showAllTasks: boolean
): Log[] =>
  !a || showAllTasks ? logs : logs.filter((log) => log.task === a.task);

export const tasksDiffer = (a: Log | undefined, b: Log | undefined): boolean =>
  !!a && !!b && a.task !== b.task;

// Same task, but the task's source changed between runs — samples may not
// line up even though the task name matches.
export const taskVersionDiffers = (
  a: Log | undefined,
  b: Log | undefined
): boolean =>
  !!a &&
  !!b &&
  a.task === b.task &&
  a.task_version !== undefined &&
  b.task_version !== undefined &&
  a.task_version !== b.task_version;
