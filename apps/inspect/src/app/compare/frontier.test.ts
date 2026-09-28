import { describe, expect, test } from "vitest";

import { EvalMetric, EvalScore, ModelUsage } from "@tsmono/inspect-common/types";

import { Log, SampleSummary } from "../../client/api/types";

import {
  accuracyDomain,
  buildFrontierPoints,
  costDomain,
  formatCost,
  linearScale,
  niceTicks,
  paretoFrontier,
  runAccuracy,
  sampleCost,
} from "./frontier";

const usage = (total_tokens: number): ModelUsage => ({
  input_tokens: 0,
  output_tokens: 0,
  total_tokens,
});

const summary = (
  overrides: Partial<SampleSummary> = {}
): SampleSummary => ({
  id: 1,
  epoch: 1,
  input: "",
  target: "",
  metadata: {},
  completed: true,
  model_usage: {},
  role_usage: {},
  ...overrides,
});

const metric = (value: number): EvalMetric => ({
  name: "accuracy",
  value,
  params: {},
});

const score = (
  name: string,
  accuracy: number,
  stderr?: number
): EvalScore => ({
  name,
  scorer: name,
  params: {},
  metrics: {
    accuracy: metric(accuracy),
    ...(stderr === undefined ? {} : { stderr: metric(stderr) }),
  },
});

const log = (overrides: Partial<Log> & Pick<Log, "name">): Log => ({
  task: null,
  task_id: null,
  mtime: null,
  depth: "listed",
  preview_attempts: 0,
  details_attempts: 0,
  details_settled_seq: 0,
  ...overrides,
});

const logWithResults = (
  name: string,
  scores: EvalScore[]
): Log =>
  log({
    name,
    header: {
      sampleCount: scores.length,
      sampleErrorCount: 0,
      sampleLimits: [],
      eval: {
        config: {},
        created: "",
        dataset: {},
        eval_id: name,
        model: "vllm/model",
        model_args: {},
        model_generate_config: {},
        packages: {},
        run_id: name,
        task: "bench",
        task_args: {},
        task_args_passed: {},
        task_attribs: {},
        task_id: name,
        task_version: 0,
      },
      results: {
        completed_samples: scores.length,
        total_samples: scores.length,
        scores,
      },
    },
  });

describe("sampleCost", () => {
  test("median total tokens across samples' model_usage", () => {
    const summaries = [
      summary({ model_usage: { a: usage(10), b: usage(20) } }), // 30
      summary({ model_usage: { a: usage(50) } }), // 50
      summary({ model_usage: { a: usage(90) } }), // 90
    ];
    expect(sampleCost(summaries, "tokens")).toBe(50);
  });

  test("median total_time, skipping samples with no time", () => {
    const summaries = [
      summary({ total_time: 5 }),
      summary({ total_time: 15 }),
      summary({ total_time: null }),
    ];
    expect(sampleCost(summaries, "time")).toBe(10);
  });

  test("no data returns undefined", () => {
    expect(sampleCost([], "tokens")).toBeUndefined();
  });
});

describe("runAccuracy", () => {
  test("reads accuracy and stderr for the given scorer", () => {
    const l = logWithResults("a", [score("match", 0.9, 0.05)]);
    expect(runAccuracy(l, "match")).toEqual({ value: 0.9, stderr: 0.05 });
  });

  test("falls back to primary_metric when there's no matching scorer", () => {
    const l = log({ name: "a", primary_metric: metric(0.75) });
    expect(runAccuracy(l, "match")).toEqual({ value: 0.75, stderr: undefined });
  });

  test("undefined when neither source has a value", () => {
    expect(runAccuracy(log({ name: "a" }), "match")).toBeUndefined();
    expect(runAccuracy(undefined, "match")).toBeUndefined();
  });
});

describe("buildFrontierPoints", () => {
  test("drops runs missing either cost or accuracy", () => {
    const runs = [
      logWithResults("a", [score("match", 0.9)]),
      log({ name: "b" }), // no accuracy
    ];
    const summaries = [[summary({ model_usage: { a: usage(100) } })], []];
    const points = buildFrontierPoints(
      runs,
      summaries,
      "match",
      "tokens",
      (i) => `run${i}`
    );
    expect(points).toEqual([
      { runIndex: 0, label: "run0", cost: 100, accuracy: 0.9, stderr: undefined },
    ]);
  });
});

describe("paretoFrontier", () => {
  test("computes the real bench frontier: gemma-4-31b alone dominates", () => {
    // Medians measured from logs/bench/*/*.eval (see task report).
    const points = [
      { runIndex: 0, label: "gemma-26b", cost: 12527, accuracy: 0.90625, stderr: undefined },
      { runIndex: 1, label: "gemma-26b-kvq4-s3", cost: 17371.5, accuracy: 0.90625, stderr: undefined },
      { runIndex: 2, label: "gemma-4-31b", cost: 4978.5, accuracy: 0.9375, stderr: undefined },
      { runIndex: 3, label: "qwen3.5-122b-nothink", cost: 5635, accuracy: 0.9375, stderr: undefined },
      { runIndex: 4, label: "qwen3.6-27b-q3", cost: 5270, accuracy: 0.9375, stderr: undefined },
      { runIndex: 5, label: "qwen3.8-27b", cost: 7695.5, accuracy: 0.9375, stderr: undefined },
      { runIndex: 6, label: "mistral-small-4", cost: 8011.5, accuracy: 0.65625, stderr: undefined },
    ];
    const { indices, line } = paretoFrontier(points);
    expect(indices).toEqual(new Set([2]));
    expect(line.map((p) => p.label)).toEqual(["gemma-4-31b"]);
  });

  test("tied runs (same cost and accuracy) both stay on the frontier", () => {
    const a = { runIndex: 0, label: "a", cost: 10, accuracy: 0.5, stderr: undefined };
    const b = { runIndex: 1, label: "b", cost: 10, accuracy: 0.5, stderr: undefined };
    expect(paretoFrontier([a, b]).indices).toEqual(new Set([0, 1]));
  });

  test("cheaper-and-better dominates; dearer-and-worse is excluded", () => {
    const cheap = { runIndex: 0, label: "cheap", cost: 5, accuracy: 0.9, stderr: undefined };
    const costly = { runIndex: 1, label: "costly", cost: 20, accuracy: 0.6, stderr: undefined };
    expect(paretoFrontier([cheap, costly]).indices).toEqual(new Set([0]));
  });
});

describe("costDomain / accuracyDomain", () => {
  test("cost domain starts at 0 and pads past the max", () => {
    const points = [
      { runIndex: 0, label: "a", cost: 100, accuracy: 0.5, stderr: undefined },
    ];
    const [lo, hi] = costDomain(points);
    expect(lo).toBe(0);
    expect(hi).toBeCloseTo(112);
  });

  test("accuracy domain pads around the 95% CI and clamps to [0, 1]", () => {
    const points = [
      { runIndex: 0, label: "a", cost: 1, accuracy: 0.98, stderr: 0.02 },
    ];
    const [lo, hi] = accuracyDomain(points);
    expect(hi).toBe(1); // 0.98 + 1.96*0.02 > 1, clamped
    expect(lo).toBeGreaterThan(0.8);
    expect(lo).toBeLessThan(0.94);
  });
});

describe("linearScale", () => {
  test("maps domain to range, including reversed ranges for a y axis", () => {
    const scale = linearScale(0, 10, 100, 0);
    expect(scale(0)).toBe(100);
    expect(scale(10)).toBe(0);
    expect(scale(5)).toBe(50);
  });
});

describe("niceTicks", () => {
  test("rounds to 1/2/5 steps and stays within [min, max]", () => {
    const ticks = niceTicks(0, 93, 5);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(93);
    }
    expect(ticks).toEqual([0, 50]);
  });

  test("a degenerate domain returns the single value", () => {
    expect(niceTicks(5, 5)).toEqual([5]);
  });
});

describe("formatCost", () => {
  test("compact token counts", () => {
    expect(formatCost(500, "tokens")).toBe("500 tok");
    expect(formatCost(4978, "tokens")).toBe("5.0k tok");
    expect(formatCost(17371, "tokens")).toBe("17k tok");
    expect(formatCost(1_500_000, "tokens")).toBe("1.5M tok");
  });

  test("time delegates to @tsmono/util's formatTime", () => {
    expect(formatCost(90, "time")).toBe("1 min 30 sec");
  });
});
