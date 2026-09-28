import { Log, SampleSummary } from "../../client/api/types";

import { classifyOutcome } from "./alignRunsGrid";

/** Accuracy ± stderr as Inspect itself computed them for this scorer. */
export const accuracyValue = (
  log: Log | undefined,
  scorer: string | undefined
): { accuracy?: number; stderr?: number } => {
  const score = log?.header?.results?.scores.find((s) => s.name === scorer);
  const accuracy = score?.metrics.accuracy?.value ?? log?.primary_metric?.value;
  return { accuracy, stderr: score?.metrics.stderr?.value };
};

const median = (values: number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : sorted[mid];
};

const totalTokens = (sample: SampleSummary): number | undefined => {
  const usages = Object.values(sample.model_usage);
  if (usages.length === 0) return undefined;
  return usages.reduce((sum, usage) => sum + usage.total_tokens, 0);
};

/** Median total tokens across a run's sample-epochs (samples with no
 *  recorded usage are excluded, not treated as zero). */
export const medianTokens = (samples: SampleSummary[]): number | undefined =>
  median(samples.map(totalTokens).filter((n): n is number => n !== undefined));

/** Median wall-clock time across a run's sample-epochs. */
export const medianTime = (samples: SampleSummary[]): number | undefined =>
  median(
    samples
      .map((s) => s.total_time)
      .filter((n): n is number => n !== undefined && n !== null)
  );

export interface FailureBreakdown {
  pass: number;
  /** Wrong answer: scored, not an infra failure. */
  fail: number;
  /** Hit a message/token/time/etc. limit before it could be scored on merit. */
  limit: number;
  /** Errored out (or scoring couldn't proceed) — an infra failure. */
  error: number;
  /** Scored but neither pass nor fail by this scorer's semantics. */
  other: number;
  /** Sample-epochs this run has no data for (excluded from the other counts). */
  total: number;
}

/** Classifies every sample-epoch in a run the same way grid cells and
 *  marks are classified (`classifyOutcome`), so the breakdown and the
 *  epoch marks never disagree about a given sample. */
export const failureBreakdown = (
  samples: SampleSummary[],
  scorer: string | undefined
): FailureBreakdown => {
  const counts: FailureBreakdown = {
    pass: 0,
    fail: 0,
    limit: 0,
    error: 0,
    other: 0,
    total: samples.length,
  };
  for (const sample of samples) {
    const { outcome } = classifyOutcome(sample, scorer);
    if (outcome === "missing") continue;
    counts[outcome] += 1;
  }
  return counts;
};

export interface RunProfile {
  accuracy?: number;
  stderr?: number;
  medianTokens?: number;
  medianTime?: number;
  breakdown: FailureBreakdown;
}

/** A column header's worth of run-level stats, computed from summaries
 *  alone (no transcript fetch): cheap enough to run for every column on
 *  every render. */
export const buildRunProfile = (
  log: Log | undefined,
  samples: SampleSummary[],
  scorer: string | undefined
): RunProfile => ({
  ...accuracyValue(log, scorer),
  medianTokens: medianTokens(samples),
  medianTime: medianTime(samples),
  breakdown: failureBreakdown(samples, scorer),
});
