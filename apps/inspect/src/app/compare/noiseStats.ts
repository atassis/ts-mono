/**
 * Pure statistics for comparing two (or one) Inspect eval runs: per-sample
 * stability across epochs, cluster-robust accuracy, and a paired A-vs-B
 * comparison. Epochs of the same sample are correlated draws, so every
 * statistic here clusters (or averages) by sample id rather than treating
 * (id, epoch) pairs as independent observations.
 */
import { SampleSummary } from "../../client/api/types";

import { outcomeOf, toNumber } from "./alignRuns";

export type SampleId = string | number;

interface Observation {
  id: SampleId;
  value: number;
}

const observationsFor = (
  samples: SampleSummary[],
  scorer: string
): Observation[] => {
  const observations: Observation[] = [];
  for (const sample of samples) {
    const value = toNumber(sample.scores?.[scorer]?.value);
    if (value !== undefined) observations.push({ id: sample.id, value });
  }
  return observations;
};

const groupById = (observations: Observation[]): Map<SampleId, number[]> => {
  const groups = new Map<SampleId, number[]>();
  for (const { id, value } of observations) {
    const group = groups.get(id);
    if (group) group.push(value);
    else groups.set(id, [value]);
  }
  return groups;
};

const mean = (values: number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

// Sample standard deviation (ddof=1); 0 for fewer than two values, matching
// inspect_ai's stderr()/std() n<2 guard.
const sampleStd = (values: number[]): number => {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sumSquares = values.reduce((sum, v) => sum + (v - m) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
};

// ---------------------------------------------------------------------------
// 1. Per-sample stability across epochs
// ---------------------------------------------------------------------------

export type Stability = "stable-pass" | "stable-fail" | "flaky";

export interface StabilityResult {
  id: SampleId;
  epochs: number;
  passCount: number;
  stability: Stability;
}

/**
 * Per-sample pass/fail stability across epochs, for one run. Only defined
 * for binary pass/fail scores (per-epoch outcomes that aren't pass/fail are
 * dropped, not counted as a third state) — non-binary scores have no
 * pass/fail stability, only a numeric spread (see `clusteredAccuracy`).
 */
export const sampleStability = (
  samples: SampleSummary[],
  scorer: string
): StabilityResult[] => {
  const passesById = new Map<SampleId, boolean[]>();
  for (const sample of samples) {
    const outcome = outcomeOf(sample.scores?.[scorer]?.value);
    if (outcome === "other") continue;
    const passes = passesById.get(sample.id) ?? [];
    passes.push(outcome === "pass");
    passesById.set(sample.id, passes);
  }

  const results: StabilityResult[] = [];
  for (const [id, passes] of passesById) {
    const passCount = passes.filter(Boolean).length;
    const epochs = passes.length;
    const stability: Stability =
      passCount === epochs
        ? "stable-pass"
        : passCount === 0
          ? "stable-fail"
          : "flaky";
    results.push({ id, epochs, passCount, stability });
  }
  return results;
};

// ---------------------------------------------------------------------------
// 2. Cluster-robust accuracy (matches inspect_ai's stderr(cluster=...))
// ---------------------------------------------------------------------------

export interface ClusteredAccuracy {
  mean: number;
  se: number;
  n: number;
  clusters: number;
}

/**
 * Mean and cluster-robust standard error, clustered by sample id. Mirrors
 * inspect_ai's `_clustered_stderr` (scorer/_metrics/std.py:86-118): a
 * finite-cluster-corrected sandwich SE (multiply the clustered variance by
 * `clusters / (clusters - 1)`, divide by `n`, not `n - 1`), so this
 * numerically matches `stderr(cluster="id")` there. Returns `se: 0` for
 * fewer than two clusters, same guard as the Python n<2 case.
 */
export const clusteredAccuracy = (
  samples: SampleSummary[],
  scorer: string
): ClusteredAccuracy => {
  const observations = observationsFor(samples, scorer);
  const n = observations.length;
  if (n === 0) return { mean: 0, se: 0, n: 0, clusters: 0 };

  const meanValue = mean(observations.map((o) => o.value));
  const clusterGroups = [...groupById(observations).values()];
  const clusters = clusterGroups.length;
  if (clusters < 2) return { mean: meanValue, se: 0, n, clusters };

  let clusteredVariance = 0;
  for (const group of clusterGroups) {
    const deviationSum = group.reduce((sum, v) => sum + (v - meanValue), 0);
    clusteredVariance += deviationSum * deviationSum;
  }
  const se = Math.sqrt((clusteredVariance * clusters) / (clusters - 1)) / n;
  return { mean: meanValue, se, n, clusters };
};

// ---------------------------------------------------------------------------
// Student-t inverse CDF (ported from inspect_ai's `_t_inv_cdf`)
// ---------------------------------------------------------------------------

const LANCZOS_G = 7;
// index 0 is the constant term; the rest pair with (xShifted + index).
const LANCZOS_COEFFICIENTS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];
const LANCZOS_CONSTANT = 0.99999999999980993;

// Lanczos approximation of ln(Gamma(x)); only ever called here with x >= 0.5
// (a = df/2 with df >= 1, or a = 0.5), so the reflection branch is unused in
// practice but kept for correctness.
const lgamma = (value: number): number => {
  if (value < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * value)) - lgamma(1 - value);
  }
  const xShifted = value - 1;
  const t = xShifted + LANCZOS_G + 0.5;
  const a = LANCZOS_COEFFICIENTS.reduce(
    (sum, c, i) => sum + c / (xShifted + i + 1),
    LANCZOS_CONSTANT
  );
  return (
    0.5 * Math.log(2 * Math.PI) +
    (xShifted + 0.5) * Math.log(t) -
    t +
    Math.log(a)
  );
};

// Lentz's continued fraction for the incomplete beta function (Numerical
// Recipes 6.4), as used by inspect_ai's `_beta_continued_fraction`.
const betaContinuedFraction = (a: number, b: number, x: number): number => {
  const maxIterations = 200;
  const epsilon = 3e-16;
  const tiny = 1e-300;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let step = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + step * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + step / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;

    step = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + step * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + step / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
};

// Regularized incomplete beta function I_x(a, b).
const regularizedIncompleteBeta = (a: number, b: number, x: number): number => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnFront =
    lgamma(a + b) -
    lgamma(a) -
    lgamma(b) +
    a * Math.log(x) +
    b * Math.log1p(-x);
  const front = Math.exp(lnFront);
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
};

/**
 * Student-t inverse CDF, dependency-free — ported from inspect_ai's
 * `_t_inv_cdf` (scorer/_metrics/std.py:437-470). Uses the regularized
 * incomplete beta function and bisection rather than a series
 * approximation, which is least accurate at exactly the small `df` this is
 * for.
 */
export const tInvCdf = (p: number, df: number): number => {
  if (!(p > 0 && p < 1)) {
    throw new Error(`t quantile requires 0 < p < 1, got ${p}`);
  }
  if (df < 1) throw new Error(`t quantile requires df >= 1, got ${df}`);
  if (p === 0.5) return 0;
  if (p < 0.5) return -tInvCdf(1 - p, df);

  const cdf = (t: number): number => {
    const x = df / (df + t * t);
    return 1 - 0.5 * regularizedIncompleteBeta(df / 2, 0.5, x);
  };

  let hi = 1;
  while (cdf(hi) < p) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

// ---------------------------------------------------------------------------
// 3. Paired A-vs-B comparison
// ---------------------------------------------------------------------------

export interface PairedComparison {
  m: number;
  meanDiff: number;
  se: number;
  df: number;
  ci: { lower: number; upper: number };
  pValue: number;
}

const EXACT_ENUMERATION_LIMIT = 20;
const MONTE_CARLO_TRIALS = 20000;

// Deterministic PRNG (mulberry32) for the Monte Carlo sign-flip fallback —
// a seeded generator keeps the p-value reproducible across test runs.
const mulberry32 = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Exact two-sided sign-flip permutation test p-value on paired differences
 * `diffs` (one per cluster/id). Null hypothesis: each diff's sign is
 * equally likely +/-. Statistic is `|sum(diffs)|`. Enumerates all 2^m sign
 * patterns for `m <= 20`; above that, falls back to Monte Carlo with a
 * seeded PRNG (`seed`) for reproducibility.
 */
export const signFlipPValue = (diffs: number[], seed = 1): number => {
  const m = diffs.length;
  if (m === 0) return 1;
  const observed = Math.abs(diffs.reduce((sum, d) => sum + d, 0));
  const epsilon = 1e-9;

  if (m <= EXACT_ENUMERATION_LIMIT) {
    const total = 2 ** m;
    let count = 0;
    for (let pattern = 0; pattern < total; pattern++) {
      const stat = diffs.reduce(
        (sum, d, i) => sum + (((pattern >> i) & 1) === 1 ? d : -d),
        0
      );
      if (Math.abs(stat) >= observed - epsilon) count++;
    }
    return count / total;
  }

  const rng = mulberry32(seed);
  let count = 0;
  for (let trial = 0; trial < MONTE_CARLO_TRIALS; trial++) {
    const stat = diffs.reduce((sum, d) => sum + (rng() < 0.5 ? d : -d), 0);
    if (Math.abs(stat) >= observed - epsilon) count++;
  }
  return count / MONTE_CARLO_TRIALS;
};

/**
 * Paired A-vs-B comparison over sample ids present in both runs. For each
 * id, `meanA_i`/`meanB_i` are that id's own mean over its own epochs (epoch
 * counts may differ between runs and across ids); `d_i = meanA_i - meanB_i`
 * is the unit of comparison, since epochs within a sample are correlated,
 * not independent, draws. Returns `undefined` for fewer than 2 common ids
 * (matching CI's need for `m - 1 >= 1` degrees of freedom).
 */
export const pairedComparison = (
  aSamples: SampleSummary[],
  bSamples: SampleSummary[],
  scorer: string,
  options: { level?: number; seed?: number } = {}
): PairedComparison | undefined => {
  const level = options.level ?? 0.95;
  const byIdA = groupById(observationsFor(aSamples, scorer));
  const byIdB = groupById(observationsFor(bSamples, scorer));

  const diffs: number[] = [];
  for (const [id, valuesA] of byIdA) {
    const valuesB = byIdB.get(id);
    if (!valuesB) continue;
    diffs.push(mean(valuesA) - mean(valuesB));
  }

  const m = diffs.length;
  if (m < 2) return undefined;

  const meanDiff = mean(diffs);
  const se = sampleStd(diffs) / Math.sqrt(m);
  const df = m - 1;
  const tail = (1 - level) / 2;
  const t = tInvCdf(1 - tail, df);
  const pValue = signFlipPValue(diffs, options.seed ?? 1);

  return {
    m,
    meanDiff,
    se,
    df,
    ci: { lower: meanDiff - t * se, upper: meanDiff + t * se },
    pValue,
  };
};

// ---------------------------------------------------------------------------
// 4. Power: epochs needed to detect a target difference
// ---------------------------------------------------------------------------

// Two-sided z at alpha=0.05 and z for 80% power — matches demo/analyze_aa.py.
const Z_ALPHA_05 = 1.959963985;
const Z_POWER_80 = 0.8416212336;

/**
 * Epochs needed to detect `targetDelta` at alpha=0.05, power=80%, assuming
 * SE scales as `1 / sqrt(epochs)` off the observed paired-diff SE at
 * `observedEpochs` — i.e. epochs are i.i.d. replicates of a fixed
 * per-sample pass probability, so averaging more of them shrinks SE at the
 * usual CLT rate. Mirrors `demo/analyze_aa.py`'s `epochs_needed`.
 */
export const epochsNeeded = (
  observedSe: number,
  observedEpochs: number,
  targetDelta: number
): number => {
  if (observedSe === 0 || !Number.isFinite(observedSe)) return 1;
  const seAtOneEpoch = observedSe * Math.sqrt(observedEpochs);
  const n = ((seAtOneEpoch * (Z_ALPHA_05 + Z_POWER_80)) / targetDelta) ** 2;
  return Math.max(1, Math.ceil(n));
};
