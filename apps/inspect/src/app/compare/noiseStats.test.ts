import { describe, expect, test } from "vitest";

import { ScoreValue } from "../../@types/extraInspect";
import { SampleSummary } from "../../client/api/types";

import {
  clusteredAccuracy,
  epochsNeeded,
  pairedComparison,
  sampleStability,
  signFlipPValue,
  tInvCdf,
} from "./noiseStats";

const SCORER = "match";

const sample = (
  id: string | number,
  epoch: number,
  value: ScoreValue
): SampleSummary => ({
  id,
  epoch,
  input: "",
  target: "",
  scores: { [SCORER]: { value, history: [] } },
  metadata: {},
  completed: true,
  model_usage: {},
  role_usage: {},
});

// Real per-(id, epoch) outcomes from logs/bench/gemma-26b (A) and
// logs/bench/gemma-26b-kvq4-s3 (B) — see
// `inspect_ai/.venv/bin/python demo/analyze_aa.py logs/bench/gemma-26b
// logs/bench/gemma-26b-kvq4-s3`. Used to cross-check clusteredAccuracy
// against inspect_ai's stderr(cluster=...) and pairedComparison against
// demo/analyze_aa.py's sign_flip_pvalue/per_id_diffs.
const A_OUTCOMES: [string | number, number, "C" | "I"][] = [
  [15, 1, "I"],
  [15, 2, "I"],
  [17, 1, "C"],
  [17, 2, "I"],
  [18, 1, "C"],
  [18, 2, "C"],
  [19, 1, "C"],
  [19, 2, "C"],
  [2, 1, "C"],
  [2, 2, "C"],
  [23, 1, "C"],
  [23, 2, "C"],
  [34, 1, "C"],
  [34, 2, "C"],
  [36, 1, "C"],
  [36, 2, "C"],
  [37, 1, "C"],
  [37, 2, "C"],
  [38, 1, "C"],
  [38, 2, "C"],
  [4, 1, "C"],
  [4, 2, "C"],
  [44, 1, "C"],
  [44, 2, "C"],
  [45, 1, "C"],
  [45, 2, "C"],
  [47, 1, "C"],
  [47, 2, "C"],
  [48, 1, "C"],
  [48, 2, "C"],
  [5, 1, "C"],
  [5, 2, "C"],
];

const B_OUTCOMES: [string | number, number, "C" | "I"][] = [
  [15, 1, "I"],
  [15, 2, "I"],
  [17, 1, "C"],
  [17, 2, "C"],
  [18, 1, "C"],
  [18, 2, "C"],
  [19, 1, "I"],
  [19, 2, "C"],
  [2, 1, "C"],
  [2, 2, "C"],
  [23, 1, "C"],
  [23, 2, "C"],
  [34, 1, "C"],
  [34, 2, "C"],
  [36, 1, "C"],
  [36, 2, "C"],
  [37, 1, "C"],
  [37, 2, "C"],
  [38, 1, "C"],
  [38, 2, "C"],
  [4, 1, "C"],
  [4, 2, "C"],
  [44, 1, "C"],
  [44, 2, "C"],
  [45, 1, "C"],
  [45, 2, "C"],
  [47, 1, "C"],
  [47, 2, "C"],
  [48, 1, "C"],
  [48, 2, "C"],
  [5, 1, "C"],
  [5, 2, "C"],
];

const runA: SampleSummary[] = A_OUTCOMES.map(([id, epoch, v]) =>
  sample(id, epoch, v)
);
const runB: SampleSummary[] = B_OUTCOMES.map(([id, epoch, v]) =>
  sample(id, epoch, v)
);

describe("sampleStability", () => {
  test("classifies stable-pass, stable-fail, and flaky", () => {
    const samples = [
      sample(1, 1, "C"),
      sample(1, 2, "C"), // stable-pass: 2/2
      sample(2, 1, "I"),
      sample(2, 2, "I"), // stable-fail: 0/2
      sample(3, 1, "C"),
      sample(3, 2, "I"), // flaky: 1/2
    ];
    const results = sampleStability(samples, SCORER);
    const byId = new Map(results.map((r) => [r.id, r]));
    expect(byId.get(1)).toEqual({
      id: 1,
      epochs: 2,
      passCount: 2,
      stability: "stable-pass",
    });
    expect(byId.get(2)).toEqual({
      id: 2,
      epochs: 2,
      passCount: 0,
      stability: "stable-fail",
    });
    expect(byId.get(3)).toEqual({
      id: 3,
      epochs: 2,
      passCount: 1,
      stability: "flaky",
    });
  });

  test("drops non-binary (non pass/fail) epochs rather than counting them", () => {
    const samples = [sample(1, 1, "C"), sample(1, 2, 0.7)];
    const results = sampleStability(samples, SCORER);
    expect(results).toEqual([
      { id: 1, epochs: 1, passCount: 1, stability: "stable-pass" },
    ]);
  });

  test("matches real fixture stability counts (14 stable-pass, 1 stable-fail, 1 flaky)", () => {
    const results = sampleStability(runA, SCORER);
    const counts = { "stable-pass": 0, "stable-fail": 0, flaky: 0 };
    for (const r of results) counts[r.stability]++;
    expect(counts).toEqual({ "stable-pass": 14, "stable-fail": 1, flaky: 1 });
  });
});

describe("clusteredAccuracy", () => {
  test("naive per-epoch SE understates the clustered SE for a correlated cluster", () => {
    // 1 id with 2 perfectly-correlated epochs (both pass) plus 4 singleton
    // ids split 2 pass / 2 fail: naive per-observation SE treats all 6
    // values as independent; the clustered SE must be strictly larger,
    // since the duplicated id contributes no new information.
    const samples = [
      sample("a", 1, "C"),
      sample("a", 2, "C"),
      sample("b", 1, "C"),
      sample("c", 1, "I"),
      sample("d", 1, "C"),
      sample("e", 1, "I"),
    ];
    const values = [1, 1, 1, 0, 1, 0];
    const n = values.length;
    const naiveMean = values.reduce((s, v) => s + v, 0) / n;
    const naiveVar =
      values.reduce((s, v) => s + (v - naiveMean) ** 2, 0) / (n - 1);
    const naiveSe = Math.sqrt(naiveVar / n);

    const clustered = clusteredAccuracy(samples, SCORER);
    expect(clustered.mean).toBeCloseTo(naiveMean, 10);
    expect(clustered.clusters).toBe(5);
    expect(clustered.se).toBeGreaterThan(naiveSe);
  });

  test("matches inspect_ai's stderr(cluster='id') on the real fixture", () => {
    // Cross-checked against inspect_ai/src/inspect_ai/scorer/_metrics/std.py
    // _clustered_stderr via a direct port of that function in Python:
    // mean=0.90625, se=0.06798820363366967, n=32, clusters=16.
    const result = clusteredAccuracy(runA, SCORER);
    expect(result.mean).toBeCloseTo(0.90625, 12);
    expect(result.se).toBeCloseTo(0.06798820363366967, 12);
    expect(result.n).toBe(32);
    expect(result.clusters).toBe(16);
  });

  test("fewer than two clusters gives se=0", () => {
    const result = clusteredAccuracy(
      [sample(1, 1, "C"), sample(1, 2, "C")],
      SCORER
    );
    expect(result.clusters).toBe(1);
    expect(result.se).toBe(0);
  });

  test("no scored samples gives all zeros", () => {
    expect(clusteredAccuracy([], SCORER)).toEqual({
      mean: 0,
      se: 0,
      n: 0,
      clusters: 0,
    });
  });
});

describe("tInvCdf", () => {
  test("df=1 (Cauchy) matches the closed form tan(pi*(p-0.5))", () => {
    expect(tInvCdf(0.75, 1)).toBeCloseTo(1.0, 9);
  });

  test("matches the reference value for the real fixture's paired CI (df=15)", () => {
    // Cross-checked against inspect_ai's _t_inv_cdf via direct Python call.
    expect(tInvCdf(0.975, 15)).toBeCloseTo(2.1314495455597733, 9);
  });
});

describe("signFlipPValue", () => {
  test("all-same-sign diffs give the minimal two-sided p-value", () => {
    // Only the all-positive and all-negative sign patterns reach the
    // observed magnitude: p = 2 / 2^4.
    expect(signFlipPValue([1, 1, 1, 1])).toBeCloseTo(2 / 16, 12);
  });

  test("symmetric diffs are not significant", () => {
    expect(signFlipPValue([1, -1, 1, -1])).toBeGreaterThan(0.5);
  });

  test("empty diffs is 1", () => {
    expect(signFlipPValue([])).toBe(1);
  });

  test("Monte Carlo fallback (m>20) agrees with the exact result's order of magnitude", () => {
    const diffs = new Array<number>(21).fill(1);
    const p = signFlipPValue(diffs, 7);
    expect(p).toBeLessThan(0.01); // exact would be 2/2^21
  });
});

describe("pairedComparison", () => {
  test("fewer than 2 common ids is undefined", () => {
    expect(
      pairedComparison([sample(1, 1, "C")], [sample(1, 1, "C")], SCORER)
    ).toBeUndefined();
  });

  test("ignores ids missing from either run", () => {
    const a = [sample(1, 1, "C"), sample(2, 1, "C"), sample(3, 1, "C")];
    const b = [sample(1, 1, "C"), sample(2, 1, "I")];
    const result = pairedComparison(a, b, SCORER);
    expect(result?.m).toBe(2);
  });

  test("uses each id's own per-epoch mean, not (id, epoch) pairing", () => {
    // id 1 has 2 epochs in A but only 1 in B: meanA=1.0 (2/2), meanB=0.0,
    // so d=1.0 even though the epoch counts differ.
    const a = [sample(1, 1, "C"), sample(1, 2, "C"), sample(2, 1, "C")];
    const b = [sample(1, 1, "I"), sample(2, 1, "C")];
    const result = pairedComparison(a, b, SCORER);
    expect(result?.m).toBe(2);
    expect(result?.meanDiff).toBeCloseTo(0.5, 12);
  });

  test("matches demo/analyze_aa.py's sign-flip test and per-id diff mean on the real fixture", () => {
    // Cross-checked via `inspect_ai/.venv/bin/python demo/analyze_aa.py
    // logs/bench/gemma-26b logs/bench/gemma-26b-kvq4-s3`: only ids 17 and
    // 19 differ (each flaky one way), giving per-id diffs of -0.5/+0.5 and
    // mean_diff=0.0. sign_flip_pvalue(per_id_diffs(diffs)) = 1.0, and the
    // t/se/ci values were confirmed against the same diffs via
    // inspect_ai.scorer._metrics.std._t_inv_cdf.
    const result = pairedComparison(runA, runB, SCORER);
    expect(result?.m).toBe(16);
    expect(result?.meanDiff).toBeCloseTo(0, 12);
    expect(result?.se).toBeCloseTo(0.04564354645876384, 12);
    expect(result?.df).toBe(15);
    expect(result?.ci.lower).toBeCloseTo(-0.09728691635726859, 9);
    expect(result?.ci.upper).toBeCloseTo(0.09728691635726859, 9);
    expect(result?.pValue).toBeCloseTo(1.0, 12);
  });
});

describe("epochsNeeded", () => {
  test("matches demo/analyze_aa.py's epochs_needed on the real fixture's paired SE", () => {
    // se_diff=0.04419417382415922, n_ep=2 from the same analyze_aa.py run
    // (this SE comes from the script's clustered_mean_se over (id, epoch)
    // diffs, not pairedComparison's per-id SE above — epochsNeeded mirrors
    // epochs_needed exactly regardless of which SE feeds it).
    expect(epochsNeeded(0.04419417382415922, 2, 0.05)).toBe(13);
    expect(epochsNeeded(0.04419417382415922, 2, 0.1)).toBe(4);
  });

  test("decreases as the target delta grows", () => {
    expect(epochsNeeded(0.05, 2, 0.1)).toBeLessThan(
      epochsNeeded(0.05, 2, 0.05)
    );
  });

  test("returns 1 for a zero observed SE", () => {
    expect(epochsNeeded(0, 2, 0.05)).toBe(1);
  });
});
