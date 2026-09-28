import { describe, expect, test } from "vitest";

import { testEvalSpec } from "@tsmono/inspect-common/testing";
import type { EvalSpec } from "@tsmono/inspect-common/types";

import { diffEvalConfig, formatDiffValue } from "./configDiff";

const spec = (overrides: Partial<EvalSpec> = {}): EvalSpec =>
  testEvalSpec({ eval_id: "e1", run_id: "r1", ...overrides });

describe("diffEvalConfig", () => {
  test("undefined either side yields no entries", () => {
    expect(diffEvalConfig(undefined, spec())).toEqual([]);
    expect(diffEvalConfig(spec(), undefined)).toEqual([]);
  });

  test("identical specs yield no entries", () => {
    const a = spec();
    const b = spec();
    expect(diffEvalConfig(a, b)).toEqual([]);
  });

  test("ignores volatile identity fields", () => {
    const a = spec({ eval_id: "e1", run_id: "r1", created: "2024-01-01" });
    const b = spec({ eval_id: "e2", run_id: "r2", created: "2024-01-02" });
    expect(diffEvalConfig(a, b)).toEqual([]);
  });

  test("ignores task_id and task_file", () => {
    const a = spec({ task_id: "t1", task_file: "/a/task.py" });
    const b = spec({ task_id: "t2", task_file: "/b/task.py" });
    expect(diffEvalConfig(a, b)).toEqual([]);
  });

  test("flags a model difference first", () => {
    const a = spec({ model: "openai-api/gemma-26b" });
    const b = spec({ model: "openai-api/gemma-26b-kvq4-s3" });
    const entries = diffEvalConfig(a, b);
    expect(entries[0]).toMatchObject({
      path: "model",
      a: { kind: "text", text: "openai-api/gemma-26b" },
      b: { kind: "text", text: "openai-api/gemma-26b-kvq4-s3" },
    });
  });

  test("flags generation config differences, defaulted value reads (default)", () => {
    const a = spec({ model_generate_config: { temperature: 0.7 } });
    const b = spec({ model_generate_config: {} });
    const entries = diffEvalConfig(a, b);
    const temp = entries.find(
      (e) => e.path === "model_generate_config.temperature"
    );
    expect(temp).toMatchObject({
      a: { kind: "text", text: "0.7" },
      b: { kind: "text", text: "(default)" },
    });
  });

  test("flags task_args_passed differences under task_args.*", () => {
    const a = spec({ task_args_passed: { split: "train" } });
    const b = spec({ task_args_passed: { split: "test" } });
    expect(diffEvalConfig(a, b)).toContainEqual({
      path: "task_args.split",
      a: { kind: "text", text: "train" },
      b: { kind: "text", text: "test" },
    });
  });

  test("flags limits under config.*", () => {
    const a = spec({ config: { message_limit: 50 } });
    const b = spec({ config: { message_limit: 100 } });
    expect(diffEvalConfig(a, b)).toContainEqual({
      path: "config.message_limit",
      a: { kind: "text", text: "50" },
      b: { kind: "text", text: "100" },
    });
  });

  test("flags revision differences", () => {
    const a = spec({ revision: { type: "git", commit: "abc", origin: "o" } });
    const b = spec({ revision: { type: "git", commit: "def", origin: "o" } });
    expect(diffEvalConfig(a, b)).toContainEqual({
      path: "revision.commit",
      a: { kind: "text", text: "abc" },
      b: { kind: "text", text: "def" },
    });
  });

  test("flags package version differences", () => {
    const a = spec({ packages: { inspect_ai: "0.3.90" } });
    const b = spec({ packages: { inspect_ai: "0.3.91" } });
    expect(diffEvalConfig(a, b)).toContainEqual({
      path: "packages.inspect_ai",
      a: { kind: "text", text: "0.3.90" },
      b: { kind: "text", text: "0.3.91" },
    });
  });

  test("object key order doesn't spuriously trigger a diff", () => {
    const a = spec({ task_args_passed: { x: 1, y: 2 } });
    const b = spec({ task_args_passed: { y: 2, x: 1 } });
    expect(diffEvalConfig(a, b)).toEqual([]);
  });

  test("orders entries model, generation config, task args, solver, limits, revision, packages", () => {
    const a = spec({
      model: "m1",
      model_generate_config: { temperature: 0.5 },
      task_args_passed: { split: "train" },
      solver: "basic_agent",
      config: { epochs: 1 },
      revision: { type: "git", commit: "abc", origin: "o" },
      packages: { inspect_ai: "0.3.90" },
    });
    const b = spec({
      model: "m2",
      model_generate_config: { temperature: 0.9 },
      task_args_passed: { split: "test" },
      solver: "react",
      config: { epochs: 3 },
      revision: { type: "git", commit: "def", origin: "o" },
      packages: { inspect_ai: "0.3.91" },
    });
    const paths = diffEvalConfig(a, b).map((e) => e.path);
    expect(paths).toEqual([
      "model",
      "model_generate_config.temperature",
      "task_args.split",
      "solver",
      "config.epochs",
      "revision.commit",
      "packages.inspect_ai",
    ]);
  });
});

describe("formatDiffValue", () => {
  test("undefined and null both read as (default)", () => {
    expect(formatDiffValue(undefined)).toEqual({
      kind: "text",
      text: "(default)",
    });
    expect(formatDiffValue(null)).toEqual({ kind: "text", text: "(default)" });
  });

  test("short values pass through as text", () => {
    expect(formatDiffValue(0.7)).toEqual({ kind: "text", text: "0.7" });
    expect(formatDiffValue("gemma-26b")).toEqual({
      kind: "text",
      text: "gemma-26b",
    });
  });

  test("long values hash instead of dumping the text, but keep it as a tooltip", () => {
    const prompt = "You are a careful agent. ".repeat(5);
    const result = formatDiffValue(prompt);
    expect(result.kind).toBe("hashed");
    expect(result.text).toMatch(/^changed \(#[0-9a-f]{6}\)$/);
    expect(result.kind === "hashed" && result.tooltip).toBe(prompt);
  });

  test("same long value hashes identically, different value hashes differently", () => {
    const a = formatDiffValue("x".repeat(100));
    const b = formatDiffValue("x".repeat(100));
    const c = formatDiffValue("y".repeat(100));
    expect(a).toEqual(b);
    expect(a.text).not.toBe(c.text);
  });
});
