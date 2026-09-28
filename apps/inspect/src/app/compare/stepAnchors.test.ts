import { describe, expect, test } from "vitest";

import {
  testAssistantMessage,
  testChatCompletionChoice,
  testModelEvent,
  testModelOutput,
  testSpanBeginEvent,
  testToolCall,
} from "@tsmono/inspect-common/testing";
import { Event, ModelEvent } from "@tsmono/inspect-common/types";

import { alignAnchors, anchorsOf } from "./stepAnchors";

const modelEvent = (
  toolCalls: { function: string; arguments: Record<string, unknown> }[] = [],
  overrides: Partial<ModelEvent> = {}
): Event =>
  testModelEvent({
    output: testModelOutput({
      choices: [
        testChatCompletionChoice({
          message: testAssistantMessage({
            content: toolCalls.length === 0 ? "some text" : "",
            tool_calls: toolCalls.map((call, i) =>
              testToolCall({
                id: `call_${i}`,
                function: call.function,
                arguments: call.arguments,
              })
            ),
          }),
        }),
      ],
    }),
    ...overrides,
  });

describe("anchorsOf", () => {
  test("one anchor per model event, non-model events skipped", () => {
    const anchors = anchorsOf([
      modelEvent([{ function: "bash", arguments: { command: "cat a.py" } }]),
      testSpanBeginEvent(),
      modelEvent([]),
    ]);
    expect(anchors).toEqual([
      {
        eventIndex: 0,
        eventId: undefined,
        signature: "bash:read",
        label: "bash: read",
      },
      { eventIndex: 2, eventId: undefined, signature: "text", label: "text" },
    ]);
  });

  test("carries the event's uuid as eventId", () => {
    const anchors = anchorsOf([modelEvent([], { uuid: "abc-123" })]);
    expect(anchors[0]?.eventId).toBe("abc-123");
  });

  test("signature/label combine every tool call in the turn", () => {
    const anchors = anchorsOf([
      modelEvent([
        { function: "bash", arguments: { command: "cat a.py" } },
        { function: "submit", arguments: {} },
      ]),
    ]);
    expect(anchors[0]?.signature).toBe("bash:read|submit:submit");
    expect(anchors[0]?.label).toBe("bash: read, submit: submit");
  });
});

// Build a run of anchors directly from a bash-command shorthand per step,
// e.g. ["cat a", "sed -i a", "text"].
const run = (steps: string[]): ReturnType<typeof anchorsOf> =>
  anchorsOf(
    steps.map((step) =>
      step === "text"
        ? modelEvent([])
        : modelEvent([{ function: "bash", arguments: { command: step } }])
    )
  );

describe("alignAnchors", () => {
  test("identical sequences pair 1:1", () => {
    const a = run(["cat a", "sed -i a", "pytest"]);
    const b = run(["cat a", "sed -i a", "pytest"]);
    expect(alignAnchors(a, b)).toEqual([
      { a: 0, b: 0 },
      { a: 1, b: 1 },
      { a: 2, b: 2 },
    ]);
  });

  test("one insertion in B", () => {
    const a = run(["cat a", "pytest"]);
    const b = run(["cat a", "sed -i a", "pytest"]);
    expect(alignAnchors(a, b)).toEqual([
      { a: 0, b: 0 },
      { a: 1, b: 2 },
    ]);
  });

  test("divergent tail: common prefix pairs, rest doesn't", () => {
    // "read" appears exactly once on each side (step 0); no other action
    // class is shared, so nothing past the prefix can pair.
    const a = run(["cat a", "sed -i a", "pytest"]);
    const b = anchorsOf([
      modelEvent([{ function: "bash", arguments: { command: "cat a" } }]),
      modelEvent([{ function: "bash", arguments: { command: "python x.py" } }]),
      modelEvent([{ function: "submit", arguments: {} }]),
    ]);
    expect(alignAnchors(a, b)).toEqual([{ a: 0, b: 0 }]);
  });

  test("empty inputs", () => {
    expect(alignAnchors([], [])).toEqual([]);
    expect(alignAnchors(run(["cat a"]), [])).toEqual([]);
    expect(alignAnchors([], run(["cat a"]))).toEqual([]);
  });

  test("weak match (same action class, different function) chosen over nothing", () => {
    // "cat a" and "grep x" both classify as "read" but have different
    // function names, so they're a weak match, not a strong one.
    const a = run(["cat a"]);
    const b = run(["grep x"]);
    expect(alignAnchors(a, b)).toEqual([{ a: 0, b: 0 }]);
  });

  test("ties: a repeated signature pairs with its earliest occurrence", () => {
    // a[0] and a[1] share the signature "bash:read" (args aren't part of it)
    // and both match b[0] equally well.
    expect(alignAnchors(run(["cat a", "cat b"]), run(["cat a"]))).toEqual([
      { a: 0, b: 0 },
    ]);
    expect(alignAnchors(run(["cat a"]), run(["cat a", "cat b"]))).toEqual([
      { a: 0, b: 0 },
    ]);
  });

  test("shared prefix stays paired when one side wanders with the same step kind", () => {
    // aa2 sample 17, epochs 1 and 3: the same three opening turns, then A
    // submits while B keeps listing and searching until the limit.
    const a = [
      ...run(["ls -R", "ls -la"]),
      ...anchorsOf([modelEvent([{ function: "submit", arguments: {} }])]),
    ];
    const b = run([
      "ls -R",
      "ls -la",
      "whoami",
      "ls /",
      "ls /home",
      "ls -la /root",
    ]);
    expect(alignAnchors(a, b)).toEqual([
      { a: 0, b: 0 },
      { a: 1, b: 1 },
    ]);
  });
});
