import { describe, expect, test } from "vitest";

import {
  testEvalMetric,
  testEvalResults,
  testEvalScore,
  testEvalSpec,
} from "@tsmono/inspect-common/testing";

import { Log, SampleSummary } from "../../client/api/types";

import {
  accuracyValue,
  buildRunProfile,
  failureBreakdown,
  medianTime,
  medianTokens,
} from "./runProfile";

const s = (extra: Partial<SampleSummary> = {}): SampleSummary => ({
  id: 1,
  epoch: 1,
  input: "",
  target: "",
  scores: { match: { value: "C", history: [] } },
  metadata: {},
  completed: true,
  model_usage: {},
  role_usage: {},
  ...extra,
});

const usage = (total_tokens: number) => ({
  default: { input_tokens: 0, output_tokens: 0, total_tokens },
});

describe("medianTokens", () => {
  test("sums usage across models, then medians", () => {
    const samples = [
      s({ model_usage: usage(100) }),
      s({ model_usage: usage(200) }),
      s({ model_usage: usage(300) }),
    ];
    expect(medianTokens(samples)).toBe(200);
  });

  test("even count averages the two middle values", () => {
    const samples = [s({ model_usage: usage(100) }), s({ model_usage: usage(300) })];
    expect(medianTokens(samples)).toBe(200);
  });

  test("samples with no usage are excluded, not zeroed", () => {
    const samples = [s({ model_usage: {} }), s({ model_usage: usage(50) })];
    expect(medianTokens(samples)).toBe(50);
  });

  test("no data at all: undefined", () => {
    expect(medianTokens([])).toBeUndefined();
  });
});

describe("medianTime", () => {
  test("medians total_time, ignoring samples without it", () => {
    const samples = [
      s({ total_time: 10 }),
      s({ total_time: null }),
      s({ total_time: 30 }),
    ];
    expect(medianTime(samples)).toBe(20);
  });
});

describe("failureBreakdown", () => {
  test("classifies pass/fail/limit/error the same way marks do", () => {
    const samples = [
      s({ scores: { match: { value: "C", history: [] } } }),
      s({ scores: { match: { value: "I", history: [] } } }),
      s({ limit: "message" }),
      s({ error: "boom" }),
    ];
    expect(failureBreakdown(samples, "match")).toEqual({
      pass: 1,
      fail: 1,
      limit: 1,
      error: 1,
      other: 0,
      total: 4,
    });
  });

  test("error takes precedence over a limit on the same sample", () => {
    const samples = [s({ error: "boom", limit: "message" })];
    expect(failureBreakdown(samples, "match")).toMatchObject({
      error: 1,
      limit: 0,
    });
  });

  test("no scorer match: counted as other, not silently dropped", () => {
    expect(failureBreakdown([s({ scores: null })], "match")).toMatchObject({
      other: 1,
      total: 1,
    });
  });
});

describe("accuracyValue", () => {
  const log = (): Log => ({
    name: "run-a",
    task: "bench",
    task_id: null,
    mtime: null,
    depth: "detailed",
    preview_attempts: 0,
    details_attempts: 0,
    details_settled_seq: 0,
    header: {
      eval: testEvalSpec({ task: "bench" }),
      results: testEvalResults({
        total_samples: 32,
        completed_samples: 32,
        scores: [
          testEvalScore({
            name: "match",
            scorer: "match",
            metrics: {
              accuracy: testEvalMetric({ name: "accuracy", value: 0.65625 }),
              stderr: testEvalMetric({ name: "stderr", value: 0.0842 }),
            },
          }),
        ],
      }),
      sampleCount: 32,
      sampleErrorCount: 0,
      sampleLimits: [],
    },
  });

  test("reads accuracy ± stderr for the named scorer", () => {
    expect(accuracyValue(log(), "match")).toEqual({
      accuracy: 0.65625,
      stderr: 0.0842,
    });
  });

  test("no scorer: undefined", () => {
    expect(accuracyValue(log(), undefined)).toEqual({
      accuracy: undefined,
      stderr: undefined,
    });
  });
});

describe("buildRunProfile", () => {
  test("real bench numbers: mistral-small-4 (32 samples)", () => {
    // Sanity-checked against logs/bench/mistral-small-4's latest .eval via
    // inspect_ai.log.read_eval_log: accuracy 0.65625, median tokens 8011.5,
    // median time ~106.63s, breakdown pass 21 / fail 8 / limit 3 / error 0.
    const samples: SampleSummary[] = [
      ...Array.from({ length: 21 }, () =>
        s({ scores: { match: { value: "C", history: [] } }, model_usage: usage(8000) })
      ),
      ...Array.from({ length: 8 }, () =>
        s({ scores: { match: { value: "I", history: [] } }, model_usage: usage(9000) })
      ),
      ...Array.from({ length: 3 }, () => s({ limit: "message" })),
    ];
    const profile = buildRunProfile(undefined, samples, "match");
    expect(profile.breakdown).toEqual({
      pass: 21,
      fail: 8,
      limit: 3,
      error: 0,
      other: 0,
      total: 32,
    });
  });
});
