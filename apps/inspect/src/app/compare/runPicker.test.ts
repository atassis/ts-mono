import { describe, expect, test } from "vitest";

import { Log } from "../../client/api/types";

import {
  candidatesForB,
  distinguishingModelLabel,
  relativeLogPath,
  runMatchesQuery,
  runSearchHaystack,
  sortRunsNewestFirst,
  tasksDiffer,
  taskVersionDiffers,
} from "./runPicker";

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

describe("relativeLogPath", () => {
  test("strips the log dir prefix", () => {
    const l = log({ name: "file:///logs/2026/a.eval" });
    expect(relativeLogPath(l, "file:///logs")).toBe("2026/a.eval");
  });

  test("tolerates a trailing slash on the dir", () => {
    const l = log({ name: "file:///logs/a.eval" });
    expect(relativeLogPath(l, "file:///logs/")).toBe("a.eval");
  });

  test("falls back to the full name when it doesn't share the prefix", () => {
    const l = log({ name: "file:///other/a.eval" });
    expect(relativeLogPath(l, "file:///logs")).toBe("file:///other/a.eval");
  });
});

describe("sortRunsNewestFirst", () => {
  test("orders by started_at descending", () => {
    const older = log({ name: "a", started_at: "2026-01-01T00:00:00Z" });
    const newer = log({ name: "b", started_at: "2026-02-01T00:00:00Z" });
    expect(sortRunsNewestFirst([older, newer])).toEqual([newer, older]);
  });

  test("falls back to completed_at when started_at is missing", () => {
    const older = log({ name: "a", completed_at: "2026-01-01T00:00:00Z" });
    const newer = log({ name: "b", completed_at: "2026-02-01T00:00:00Z" });
    expect(sortRunsNewestFirst([older, newer])).toEqual([newer, older]);
  });

  test("runs with no timestamp sort last", () => {
    const undated = log({ name: "a" });
    const dated = log({ name: "b", started_at: "2026-01-01T00:00:00Z" });
    expect(sortRunsNewestFirst([undated, dated])).toEqual([dated, undated]);
  });
});

describe("runSearchHaystack / runMatchesQuery", () => {
  const l = log({
    name: "file:///logs/2026-01-02T03-04-05_agentic-repo.eval",
    model: "openai/gpt-4o",
    task: "agentic_repo",
    started_at: "2026-01-02T03:04:05Z",
  });
  const haystack = runSearchHaystack(l, "file:///logs");

  test("matches on model, task, path, and date", () => {
    expect(runMatchesQuery(haystack, "gpt-4o")).toBe(true);
    expect(runMatchesQuery(haystack, "agentic_repo")).toBe(true);
    expect(runMatchesQuery(haystack, "2026-01-02t03-04-05")).toBe(true);
    expect(runMatchesQuery(haystack, "2026-01-02")).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(runMatchesQuery(haystack, "GPT-4O")).toBe(true);
  });

  test("requires every whitespace-separated term to match (AND)", () => {
    expect(runMatchesQuery(haystack, "gpt-4o agentic_repo")).toBe(true);
    expect(runMatchesQuery(haystack, "gpt-4o mistral")).toBe(false);
  });

  test("empty query matches everything", () => {
    expect(runMatchesQuery(haystack, "   ")).toBe(true);
  });
});

describe("candidatesForB", () => {
  const a = log({ name: "a", task: "bench" });
  const sameTask = log({ name: "b", task: "bench" });
  const otherTask = log({ name: "c", task: "other" });

  test("no A picked: every run is a candidate", () => {
    expect(candidatesForB([a, sameTask, otherTask], undefined, false)).toEqual([
      a,
      sameTask,
      otherTask,
    ]);
  });

  test("A picked: scoped to A's task", () => {
    expect(candidatesForB([a, sameTask, otherTask], a, false)).toEqual([
      a,
      sameTask,
    ]);
  });

  test("file-name task (header not loaded) matches the eval task name", () => {
    const loaded = log({ name: "a", task: "agentic_repo" });
    const unloaded = log({ name: "b", task: "agentic-repo" });
    expect(candidatesForB([loaded, unloaded], loaded, false)).toEqual([
      loaded,
      unloaded,
    ]);
    expect(tasksDiffer(loaded, unloaded)).toBe(false);
  });

  test("show-all-tasks bypasses the scope", () => {
    expect(candidatesForB([a, sameTask, otherTask], a, true)).toEqual([
      a,
      sameTask,
      otherTask,
    ]);
  });
});

describe("tasksDiffer", () => {
  test("true when both picked and tasks differ", () => {
    expect(
      tasksDiffer(log({ name: "a", task: "x" }), log({ name: "b", task: "y" }))
    ).toBe(true);
  });
  test("false when either side is unpicked", () => {
    expect(tasksDiffer(undefined, log({ name: "b", task: "y" }))).toBe(false);
  });
  test("false when tasks match", () => {
    expect(
      tasksDiffer(log({ name: "a", task: "x" }), log({ name: "b", task: "x" }))
    ).toBe(false);
  });
});

describe("distinguishingModelLabel", () => {
  const modelA = "openai-api/gw/qwen3.5-122b-nothink";
  const modelB = "openai-api/gw/qwen3.6-27b-q3";
  const modelC = "openai-api/gw/qwen3.8-27b";
  const models = [modelA, modelB, modelC];

  test("strips the prefix every model shares", () => {
    expect(distinguishingModelLabel(modelA, models)).toBe(
      "qwen3.5-122b-nothink"
    );
    expect(distinguishingModelLabel(modelB, models)).toBe("qwen3.6-27b-q3");
  });

  test("leaves the model alone with fewer than two models", () => {
    expect(distinguishingModelLabel("openai-api/gw/qwen3.5", [])).toBe(
      "openai-api/gw/qwen3.5"
    );
    expect(
      distinguishingModelLabel("openai-api/gw/qwen3.5", [
        "openai-api/gw/qwen3.5",
      ])
    ).toBe("openai-api/gw/qwen3.5");
  });

  test("leaves the model alone with no shared prefix", () => {
    expect(
      distinguishingModelLabel("openai/gpt-4o", [
        "openai/gpt-4o",
        "anthropic/claude",
      ])
    ).toBe("openai/gpt-4o");
  });
});

describe("taskVersionDiffers", () => {
  test("true when task matches but task_version doesn't", () => {
    const a = log({ name: "a", task: "x", task_version: 1 });
    const b = log({ name: "b", task: "x", task_version: 2 });
    expect(taskVersionDiffers(a, b)).toBe(true);
  });
  test("false when a task_version is missing", () => {
    const a = log({ name: "a", task: "x" });
    const b = log({ name: "b", task: "x", task_version: 2 });
    expect(taskVersionDiffers(a, b)).toBe(false);
  });
  test("false when tasks differ (that's tasksDiffer's job)", () => {
    const a = log({ name: "a", task: "x", task_version: 1 });
    const b = log({ name: "b", task: "y", task_version: 2 });
    expect(taskVersionDiffers(a, b)).toBe(false);
  });
});
