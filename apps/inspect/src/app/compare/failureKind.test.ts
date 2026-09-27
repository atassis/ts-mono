import { describe, expect, test } from "vitest";

import { SampleSummary } from "../../client/api/types";

import { explainPair, failureKind } from "./failureKind";

const s = (extra: Partial<SampleSummary> = {}): SampleSummary => ({
  id: 1,
  epoch: 1,
  input: "",
  target: "",
  scores: null,
  metadata: {},
  completed: true,
  model_usage: {},
  role_usage: {},
  ...extra,
});

describe("failureKind", () => {
  test("scored normally", () => {
    expect(failureKind(s())).toEqual({ kind: "none", retries: undefined });
  });

  test("errored sample", () => {
    expect(failureKind(s({ error: "boom" }))).toEqual({
      kind: "error",
      message: "boom",
      retries: undefined,
    });
  });

  test("known limit kind, with reason", () => {
    expect(
      failureKind(s({ limit: "message", limit_reason: "count: 51; limit: 50" }))
    ).toEqual({
      kind: "limit",
      limit: "message",
      raw: "message",
      reason: "count: 51; limit: 50",
      retries: undefined,
    });
  });

  test("unrecognized limit string falls back to other, raw preserved", () => {
    expect(failureKind(s({ limit: "budget" }))).toMatchObject({
      kind: "limit",
      limit: "other",
      raw: "budget",
    });
  });

  test("error takes precedence over limit", () => {
    expect(failureKind(s({ error: "boom", limit: "message" }))).toMatchObject({
      kind: "error",
      message: "boom",
    });
  });

  test("retries reported alongside error", () => {
    expect(failureKind(s({ error: "boom", retries: 2 }))).toEqual({
      kind: "error",
      message: "boom",
      retries: 2,
    });
  });

  test("retries reported alongside limit", () => {
    expect(failureKind(s({ limit: "token", retries: 1 }))).toMatchObject({
      kind: "limit",
      limit: "token",
      retries: 1,
    });
  });

  test("retries=0 is not reported (no retry occurred)", () => {
    expect(failureKind(s({ retries: 0 }))).toEqual({
      kind: "none",
      retries: undefined,
    });
  });

  // Real data: logs/bench/gemma-26b — sample 15/epoch 1 hit the message
  // limit (read via inspect_ai.log.read_eval_log_sample_summaries).
  test("real fixture: message limit from logs/bench/gemma-26b", () => {
    const summary = s({
      id: 15,
      epoch: 1,
      limit: "message",
      limit_reason: "Message limit exceeded. count: 51; limit: 50",
      scores: { includes: { value: "I", history: [] } },
    });
    expect(failureKind(summary)).toMatchObject({
      kind: "limit",
      limit: "message",
    });
  });

  // Real data: logs/_failed/bench/qwen3.8-27b — sample 17/epoch 1 errored
  // with a cancelled model call, scores left empty ({}), not null.
  test("real fixture: error from logs/_failed/bench/qwen3.8-27b", () => {
    const summary = s({
      id: 17,
      epoch: 1,
      error: "CancelledError('Cancelled via cancel scope 7f895f2019f0')",
      scores: {},
      retries: 0,
    });
    expect(failureKind(summary)).toEqual({
      kind: "error",
      message: "CancelledError('Cancelled via cancel scope 7f895f2019f0')",
      retries: undefined,
    });
  });
});

describe("explainPair", () => {
  test("both sides scored normally: on merit", () => {
    expect(explainPair({ a: s(), b: s() })).toEqual({
      onMerit: true,
      a: undefined,
      b: undefined,
    });
  });

  test("regression explained by a limit on side b", () => {
    const result = explainPair({ a: s(), b: s({ limit: "message" }) });
    expect(result.onMerit).toBe(false);
    expect(result.a).toBeUndefined();
    expect(result.b).toMatchObject({ kind: "limit", limit: "message" });
  });

  test("explained by an error on side a", () => {
    const result = explainPair({ a: s({ error: "boom" }), b: s() });
    expect(result.onMerit).toBe(false);
    expect(result.a).toMatchObject({ kind: "error" });
    expect(result.b).toBeUndefined();
  });

  test("both sides flagged", () => {
    const result = explainPair({
      a: s({ error: "boom" }),
      b: s({ limit: "token" }),
    });
    expect(result.onMerit).toBe(false);
    expect(result.a).toMatchObject({ kind: "error" });
    expect(result.b).toMatchObject({ kind: "limit", limit: "token" });
  });

  test("missing side (only-a/only-b row) is not flagged by the absent side", () => {
    expect(explainPair({ a: s() })).toEqual({
      onMerit: true,
      a: undefined,
      b: undefined,
    });
  });
});
