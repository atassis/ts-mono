import { describe, expect, test } from "vitest";

import { Log } from "../../client/api/types";

import { shortRunLabel } from "./shortRunLabel";

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

describe("shortRunLabel", () => {
  test("drops the provider prefix", () => {
    expect(
      shortRunLabel(
        log({ name: "file:///a.eval", model: "openai-api/gemma-26b" })
      )
    ).toBe("gemma-26b");
  });

  test("keeps distinguishing suffixes intact (no truncation)", () => {
    expect(
      shortRunLabel(
        log({ name: "file:///a.eval", model: "vllm/qwen3.6-27b-q3" })
      )
    ).toBe("qwen3.6-27b-q3");
    expect(
      shortRunLabel(log({ name: "file:///b.eval", model: "vllm/qwen3.8-27b" }))
    ).toBe("qwen3.8-27b");
  });

  test("falls back to task, then the log name, when there's no model yet", () => {
    expect(shortRunLabel(log({ name: "file:///a.eval", task: "bench" }))).toBe(
      "bench"
    );
    expect(shortRunLabel(log({ name: "file:///a.eval" }))).toBe(
      "file:///a.eval"
    );
  });

  test("undefined log", () => {
    expect(shortRunLabel(undefined)).toBe("—");
  });
});
