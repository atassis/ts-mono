import { describe, expect, test } from "vitest";

import {
  testAssistantMessage,
  testChatCompletionChoice,
  testModelEvent,
  testModelOutput,
  testToolCall,
  testToolEvent,
} from "@tsmono/inspect-common/testing";
import { Event } from "@tsmono/inspect-common/types";

import { firstDivergence, stepsOf, terminalDivergence } from "./divergence";

const modelEvent = (
  text: string,
  toolCalls: { function: string; arguments: Record<string, unknown> }[] = []
): Event =>
  testModelEvent({
    output: testModelOutput({
      choices: [
        testChatCompletionChoice({
          message: testAssistantMessage({
            content: text,
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
  });

const toolResultEvent = (fn: string, result: string): Event =>
  testToolEvent({ function: fn, result });

describe("stepsOf", () => {
  test("splits a model event into text + one step per tool call", () => {
    const steps = stepsOf([
      modelEvent("diagnosing the bug", [
        { function: "apply_patch", arguments: { path: "a.py", diff: "x" } },
      ]),
    ]);
    expect(steps).toEqual([
      { kind: "assistant-text", eventIndex: 0, text: "diagnosing the bug" },
      {
        kind: "tool-call",
        eventIndex: 0,
        function: "apply_patch",
        args: '{"diff":"x","path":"a.py"}',
        actionClass: "run",
      },
    ]);
  });

  test("drops empty assistant text (tool-only turn)", () => {
    const steps = stepsOf([
      modelEvent("", [{ function: "bash", arguments: {} }]),
    ]);
    expect(steps.map((step) => step.kind)).toEqual(["tool-call"]);
  });

  test("normalizes whitespace in assistant text", () => {
    const steps = stepsOf([modelEvent("  line one\n\n line two  ")]);
    expect(steps).toEqual([
      { kind: "assistant-text", eventIndex: 0, text: "line one line two" },
    ]);
  });

  test("canonicalizes tool args regardless of key order", () => {
    const a = stepsOf([
      modelEvent("", [{ function: "f", arguments: { b: 1, a: 2 } }]),
    ]);
    const b = stepsOf([
      modelEvent("", [{ function: "f", arguments: { a: 2, b: 1 } }]),
    ]);
    expect(a).toEqual(b);
  });

  test("emits a tool-result step for tool events, ignores bookkeeping events", () => {
    const steps = stepsOf([
      modelEvent("using bash"),
      toolResultEvent("bash", "ok"),
    ]);
    expect(steps.map((step) => step.kind)).toEqual([
      "assistant-text",
      "tool-result",
    ]);
  });
});

describe("firstDivergence", () => {
  test("identical sequences", () => {
    const events = [
      modelEvent("same text", [{ function: "f", arguments: {} }]),
    ];
    const result = firstDivergence(stepsOf(events), stepsOf(events));
    expect(result).toEqual({ kind: "identical" });
  });

  test("tool name divergence takes priority over assistant text drift", () => {
    const a = stepsOf([
      modelEvent("text differs here", [
        { function: "apply_patch", arguments: {} },
      ]),
    ]);
    const b = stepsOf([
      modelEvent("text differs there", [{ function: "bash", arguments: {} }]),
    ]);
    const result = firstDivergence(a, b);
    expect(result).toEqual({
      kind: "diverged",
      indexA: 1,
      indexB: 1,
      reason: "tool-name",
      firstTextDivergence: { indexA: 0, indexB: 0 },
    });
  });

  test("tool args divergence", () => {
    const a = stepsOf([
      modelEvent("", [{ function: "f", arguments: { path: "a.py" } }]),
    ]);
    const b = stepsOf([
      modelEvent("", [{ function: "f", arguments: { path: "b.py" } }]),
    ]);
    expect(firstDivergence(a, b)).toEqual({
      kind: "diverged",
      indexA: 0,
      indexB: 0,
      reason: "tool-args",
      firstTextDivergence: undefined,
    });
  });

  test("tool result divergence", () => {
    const a = stepsOf([toolResultEvent("bash", "ok")]);
    const b = stepsOf([toolResultEvent("bash", "error: not found")]);
    expect(firstDivergence(a, b)).toEqual({
      kind: "diverged",
      indexA: 0,
      indexB: 0,
      reason: "tool-result",
      firstTextDivergence: undefined,
    });
  });

  test("diagnose-but-don't-apply: one side ends its turn after the diagnosis", () => {
    const a = stepsOf([
      modelEvent("the bug is in foo()"),
      modelEvent("", [
        { function: "apply_patch", arguments: { path: "a.py" } },
      ]),
    ]);
    const b = stepsOf([modelEvent("the bug is in foo(), all done")]);
    const result = firstDivergence(a, b);
    expect(result).toEqual({
      kind: "diverged",
      indexA: 1,
      indexB: 1,
      reason: "length",
      firstTextDivergence: { indexA: 0, indexB: 0 },
    });
  });

  test("differing step kind at the same index", () => {
    const a = stepsOf([modelEvent("", [{ function: "f", arguments: {} }])]);
    const b = stepsOf([modelEvent("just text, no tool call")]);
    expect(firstDivergence(a, b)).toEqual({
      kind: "diverged",
      indexA: 0,
      indexB: 0,
      reason: "step-kind",
      firstTextDivergence: undefined,
    });
  });

  test("text-only divergence is reported when nothing else ever diverges", () => {
    const a = stepsOf([modelEvent("hello there")]);
    const b = stepsOf([modelEvent("hello world")]);
    expect(firstDivergence(a, b)).toEqual({
      kind: "diverged",
      indexA: 0,
      indexB: 0,
      reason: "assistant-text",
    });
  });

  test("length divergence with no text seen (tool-only transcripts)", () => {
    const a = stepsOf([modelEvent("", [{ function: "f", arguments: {} }])]);
    const b: ReturnType<typeof stepsOf> = [];
    expect(firstDivergence(a, b)).toEqual({
      kind: "diverged",
      indexA: 0,
      indexB: 0,
      reason: "length",
      firstTextDivergence: undefined,
    });
  });
});

const bash = (
  command: string
): { function: string; arguments: Record<string, unknown> } => ({
  function: "bash",
  arguments: { command },
});
const submit = (
  answer: string
): { function: string; arguments: Record<string, unknown> } => ({
  function: "submit",
  arguments: { answer },
});

describe("stepsOf tool-call action classes", () => {
  test.each([
    ["cat /work/calc.py", "read"],
    ["ls -la /work", "read"],
    ["cd /work && python3 -m pytest -q", "test"],
    ["sed -i 's/a/b/' /work/calc.py", "write"],
    ["cat <<EOF > /work/calc.py\nprint(1)\nEOF", "write"],
    ["echo hi > /work/out.txt", "write"],
    ["cd /work && python3 join.py && diff report.csv expected.csv", "read"],
    ["bash /work/run.sh", "run"],
  ] as const)("classifies %s as %s", (command, expected) => {
    const [step] = stepsOf([modelEvent("", [bash(command)])]);
    expect(step).toMatchObject({ actionClass: expected });
  });

  test("submit is its own class regardless of argument shape", () => {
    const [step] = stepsOf([modelEvent("", [submit("the fix")])]);
    expect(step).toMatchObject({ actionClass: "submit" });
  });
});

describe("terminalDivergence", () => {
  // Shaped after the real agentic-repo failure mode: mistral-small-4 reads
  // and diagnoses, then submits without ever running a write command;
  // gemma-26b edits the file, re-runs tests, then submits. Index-based
  // firstDivergence lands this at step 0 ("narrate" vs "act first") --
  // true but not the story; terminalDivergence names the real gap.
  test("names the missing write when one side never edits before submitting", () => {
    const mistral = stepsOf([
      modelEvent("Let me look at the code."),
      modelEvent("", [bash("cd /work && python3 -m pytest -q")]),
      modelEvent("I can see the bug now."),
      modelEvent("", [bash("cat /work/calc.py")]),
      modelEvent("Here's the fix, as text."),
      modelEvent("", [submit("change `n < 1` to `n <= 1`")]),
    ]);
    const gemma = stepsOf([
      modelEvent("", [bash("cat /work/calc.py")]),
      modelEvent("", [bash("cd /work && python3 -m pytest -q")]),
      modelEvent("", [bash("sed -i 's/n < 1/n <= 1/' /work/calc.py")]),
      modelEvent("", [bash("cd /work && python3 -m pytest -q")]),
      modelEvent("", [submit("fixed")]),
    ]);

    const result = terminalDivergence(mistral, gemma);

    expect(result.a).toEqual({
      reads: 1,
      writes: 0,
      tests: 1,
      runs: 0,
      submitted: true,
    });
    expect(result.b).toEqual({
      reads: 1,
      writes: 1,
      tests: 2,
      runs: 0,
      submitted: true,
    });
    expect(result.summary).toBe(
      "A read 1 time(s), ran tests 1 time(s), then submitted; " +
        "B read 1 time(s), ran tests 2 time(s), edited 1 time(s), then submitted"
    );
  });

  test("names an unsubmitted turn", () => {
    const stopped = stepsOf([modelEvent("", [bash("ls /work")])]);
    const finished = stepsOf([
      modelEvent("", [bash("sed -i 's/a/b/' /work/f.py")]),
      modelEvent("", [submit("done")]),
    ]);
    expect(terminalDivergence(stopped, finished).summary).toBe(
      "A read 1 time(s), then ended its turn without submitting; " +
        "B edited 1 time(s), then submitted"
    );
  });
});
