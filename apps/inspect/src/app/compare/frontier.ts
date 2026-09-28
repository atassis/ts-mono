import { formatTime } from "@tsmono/util";

import { Log, SampleSummary } from "../../client/api/types";

export type CostMetric = "tokens" | "time";

export interface FrontierPoint {
  runIndex: number;
  label: string;
  cost: number;
  accuracy: number;
  stderr: number | undefined;
}

const median = (values: number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) return undefined; // unreachable given the length check above
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
};

/** Median per-sample-epoch cost for one run: summed `total_tokens` across a
 *  sample's `model_usage`, or `total_time`, across its sample summaries. */
export const sampleCost = (
  summaries: SampleSummary[],
  metric: CostMetric
): number | undefined => {
  const values =
    metric === "tokens"
      ? summaries.map((s) =>
          Object.values(s.model_usage).reduce(
            (sum, usage) => sum + usage.total_tokens,
            0
          )
        )
      : summaries
          .map((s) => s.total_time)
          .filter((t): t is number => t !== null && t !== undefined);
  return median(values);
};

/** Accuracy ± stderr as Inspect computed them for this scorer — the same
 *  source RunsGrid's `runMetric` reads, kept as numbers instead of a
 *  formatted string. */
export const runAccuracy = (
  log: Log | undefined,
  scorer: string | undefined
): { value: number; stderr: number | undefined } | undefined => {
  const score = log?.header?.results?.scores.find((s) => s.name === scorer);
  const value = score?.metrics.accuracy?.value ?? log?.primary_metric?.value;
  if (value === undefined) return undefined;
  return { value, stderr: score?.metrics.stderr?.value };
};

/** One point per run that has both a cost and an accuracy — runs still
 *  loading or missing either are dropped rather than plotted at zero. */
export const buildFrontierPoints = (
  runs: readonly (Log | undefined)[],
  summaries: readonly SampleSummary[][],
  scorer: string | undefined,
  metric: CostMetric,
  label: (runIndex: number) => string
): FrontierPoint[] => {
  const points: FrontierPoint[] = [];
  runs.forEach((log, runIndex) => {
    const accuracy = runAccuracy(log, scorer);
    const cost = sampleCost(summaries[runIndex] ?? [], metric);
    if (accuracy === undefined || cost === undefined) return;
    points.push({
      runIndex,
      label: label(runIndex),
      cost,
      accuracy: accuracy.value,
      stderr: accuracy.stderr,
    });
  });
  return points;
};

/** Runs no other run beats on both higher-or-equal accuracy and
 *  lower-or-equal cost, with at least one strict — i.e. non-dominated runs.
 *  Two runs tied on both axes stay on the frontier together (neither beats
 *  the other), so indistinguishable runs are never silently dropped. */
export const paretoFrontier = (
  points: readonly FrontierPoint[]
): { indices: Set<number>; line: FrontierPoint[] } => {
  const dominated = (p: FrontierPoint): boolean =>
    points.some(
      (q) =>
        q !== p &&
        q.cost <= p.cost &&
        q.accuracy >= p.accuracy &&
        (q.cost < p.cost || q.accuracy > p.accuracy)
    );
  const frontier = points.filter((p) => !dominated(p));
  const line = [...frontier].sort((a, b) => a.cost - b.cost);
  return { indices: new Set(frontier.map((p) => p.runIndex)), line };
};

/** Cost axis domain: 0 to just past the highest point, so the rightmost
 *  point never sits flush on the plot edge. */
export const costDomain = (
  points: readonly FrontierPoint[]
): [number, number] => {
  const max = points.reduce((m, p) => Math.max(m, p.cost), 0);
  return [0, max === 0 ? 1 : max * 1.12];
};

/** Accuracy axis domain: padded around each point's 95% CI (±1.96·stderr,
 *  clamped to [0, 1]) so error bars never touch the plot edge. */
export const accuracyDomain = (
  points: readonly FrontierPoint[]
): [number, number] => {
  if (points.length === 0) return [0, 1];
  const los = points.map((p) =>
    Math.max(0, p.accuracy - 1.96 * (p.stderr ?? 0))
  );
  const his = points.map((p) =>
    Math.min(1, p.accuracy + 1.96 * (p.stderr ?? 0))
  );
  const lo = Math.min(...los);
  const hi = Math.max(...his);
  const pad = (hi - lo) * 0.15 || 0.05;
  return [Math.max(0, lo - pad), Math.min(1, hi + pad)];
};

export type Scale = (value: number) => number;

export const linearScale = (
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number
): Scale => {
  const span = domainMax - domainMin || 1;
  return (value) =>
    rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
};

/** "Nice" round tick values within [min, max] (D3's nice-ticks heuristic:
 *  step rounds up to 1/2/5/10 × a power of ten of the raw span/count). */
export const niceTicks = (min: number, max: number, count = 5): number[] => {
  if (min === max) return [min];
  const span = max - min;
  const rawStep = span / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / magnitude;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  const step = niceNorm * magnitude;
  const niceMin = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  // Float accumulation drifts over many steps; round each tick to the
  // step's own precision instead of relying on raw addition, and use a
  // tiny epsilon (not a half-step) so ticks stay within [min, max].
  for (let i = 0; niceMin + i * step <= max + 1e-9; i++) {
    const t = niceMin + i * step;
    ticks.push(Math.round(t / step) * step);
  }
  return ticks;
};

const formatTokens = (value: number): string => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M tok`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k tok`;
  }
  return `${Math.round(value)} tok`;
};

export const formatCost = (value: number, metric: CostMetric): string =>
  metric === "tokens" ? formatTokens(value) : formatTime(value);
