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
  test("drops the provider prefix with fewer than two models", () => {
    expect(
      shortRunLabel(
        log({ name: "file:///a.eval", model: "openai-api/gemma-26b" }),
        ["openai-api/gemma-26b"]
      )
    ).toBe("gemma-26b");
  });

  test("keeps distinguishing suffixes intact (no truncation)", () => {
    const allModels = ["vllm/qwen3.6-27b-q3", "vllm/qwen3.8-27b"];
    expect(
      shortRunLabel(
        log({ name: "file:///a.eval", model: "vllm/qwen3.6-27b-q3" }),
        allModels
      )
    ).toBe("qwen3.6-27b-q3");
    expect(
      shortRunLabel(
        log({ name: "file:///b.eval", model: "vllm/qwen3.8-27b" }),
        allModels
      )
    ).toBe("qwen3.8-27b");
  });

  test("shares distinguishingModelLabel's deeper-nesting behavior with RunPicker", () => {
    const allModels = ["vllm/qwen/3.6-27b-q3", "vllm/mistral/small-4"];
    expect(
      shortRunLabel(
        log({ name: "file:///a.eval", model: "vllm/qwen/3.6-27b-q3" }),
        allModels
      )
    ).toBe("qwen/3.6-27b-q3");
  });

  test("falls back to task, then the log name, when there's no model yet", () => {
    expect(
      shortRunLabel(log({ name: "file:///a.eval", task: "bench" }), [])
    ).toBe("bench");
    expect(shortRunLabel(log({ name: "file:///a.eval" }), [])).toBe(
      "file:///a.eval"
    );
  });

  test("undefined log", () => {
    expect(shortRunLabel(undefined, [])).toBe("—");
  });
});
