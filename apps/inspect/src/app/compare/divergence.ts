import { Content, Event } from "@tsmono/inspect-common/types";

export type StepKind = "assistant-text" | "tool-call" | "tool-result";

interface StepBase {
  kind: StepKind;
  /** Index into the sample's `events` array — what a viewer scrolls to. */
  eventIndex: number;
}

export interface AssistantTextStep extends StepBase {
  kind: "assistant-text";
  text: string;
}

export interface ToolCallStep extends StepBase {
  kind: "tool-call";
  function: string;
  args: string;
}

export interface ToolResultStep extends StepBase {
  kind: "tool-result";
  function: string;
  result: string;
}

export type Step = AssistantTextStep | ToolCallStep | ToolResultStep;

const normalizeWhitespace = (text: string): string =>
  text.trim().replace(/\s+/g, " ");

const textOfContent = (content: string | Content[]): string => {
  if (typeof content === "string") return normalizeWhitespace(content);
  const parts: string[] = [];
  for (const part of content) {
    if (part.type === "text") parts.push(part.text);
  }
  return normalizeWhitespace(parts.join(" "));
};

// Deep, key-sorted JSON so structurally-equal args compare equal regardless
// of insertion order (models don't emit args in a stable key order). Takes
// `unknown` because ToolCall.arguments is an untyped bag by design.
const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

const resultToText = (
  result: string | number | boolean | Content | Content[]
): string => {
  if (typeof result === "string") return normalizeWhitespace(result);
  if (typeof result === "number" || typeof result === "boolean")
    return String(result);
  return textOfContent(Array.isArray(result) ? result : [result]);
};

const stepsForModelEvent = (
  event: Extract<Event, { event: "model" }>,
  eventIndex: number
): Step[] => {
  const steps: Step[] = [];
  const choice = event.output.choices[0];
  if (!choice) return steps;
  const text = textOfContent(choice.message.content);
  if (text.length > 0) {
    steps.push({ kind: "assistant-text", eventIndex, text });
  }
  for (const call of choice.message.tool_calls ?? []) {
    steps.push({
      kind: "tool-call",
      eventIndex,
      function: call.function,
      args: canonicalize(call.arguments),
    });
  }
  return steps;
};

/**
 * Flattens a sample's `events` (not `messages`) into the sequence of steps
 * relevant to divergence: assistant text, tool calls, tool results. Events
 * carry the index the transcript UI scrolls by, and messages are only ever
 * a projection of events already covered here (e.g. a ChatMessageTool
 * echoing a ToolEvent's result back into the next model call) — walking
 * both would double-count. Structural/bookkeeping events (span begin/end,
 * state, store, sample_init, logger, ...) are dropped: they carry ids,
 * timestamps and token usage that the spec says to ignore.
 */
export const stepsOf = (events: Event[]): Step[] => {
  const steps: Step[] = [];
  events.forEach((event, eventIndex) => {
    if (event.event === "model") {
      steps.push(...stepsForModelEvent(event, eventIndex));
    } else if (event.event === "tool") {
      steps.push({
        kind: "tool-result",
        eventIndex,
        function: event.function,
        result: resultToText(event.result),
      });
    }
  });
  return steps;
};

export type DivergenceReason =
  | "tool-name"
  | "tool-args"
  | "assistant-text"
  | "tool-result"
  | "step-kind"
  | "length";

export interface TextDivergence {
  indexA: number;
  indexB: number;
}

export type DivergenceResult =
  | { kind: "identical" }
  | {
      kind: "diverged";
      indexA: number;
      indexB: number;
      reason: DivergenceReason;
      /**
       * First point the two assistant-text steps differed, even when a
       * later, more meaningful divergence (tool name/args/result, or one
       * side ending early) is what's reported above. Sampling temperature
       * > 0 makes assistant text differ almost everywhere, so text-only
       * disagreement is never itself the primary reason unless nothing
       * else ever diverges.
       */
      firstTextDivergence?: TextDivergence;
    };

/**
 * First point two step sequences diverge. Tool-call/tool-result/length
 * divergence always wins over assistant-text divergence: text drifts on
 * almost every step under sampling, so reporting the first text mismatch
 * as "the" divergence would point at step 0 nearly every time and hide the
 * behavioral difference (e.g. one model calls a fix-it tool, the other
 * ends its turn after describing the fix). Text divergence is surfaced
 * separately via `firstTextDivergence` and only promoted to `reason` when
 * every step present on both sides otherwise matches.
 */
export const firstDivergence = (a: Step[], b: Step[]): DivergenceResult => {
  const len = Math.min(a.length, b.length);
  let firstText: TextDivergence | undefined;

  for (let i = 0; i < len; i++) {
    const stepA = a[i];
    const stepB = b[i];
    // Unreachable: i < len = min(a.length, b.length). Satisfies
    // noUncheckedIndexedAccess without a cast.
    if (stepA === undefined || stepB === undefined) break;

    if (stepA.kind !== stepB.kind) {
      return {
        kind: "diverged",
        indexA: i,
        indexB: i,
        reason: "step-kind",
        firstTextDivergence: firstText,
      };
    }

    if (stepA.kind === "assistant-text" && stepB.kind === "assistant-text") {
      if (stepA.text !== stepB.text) firstText ??= { indexA: i, indexB: i };
      continue;
    }

    if (stepA.kind === "tool-call" && stepB.kind === "tool-call") {
      if (stepA.function !== stepB.function) {
        return {
          kind: "diverged",
          indexA: i,
          indexB: i,
          reason: "tool-name",
          firstTextDivergence: firstText,
        };
      }
      if (stepA.args !== stepB.args) {
        return {
          kind: "diverged",
          indexA: i,
          indexB: i,
          reason: "tool-args",
          firstTextDivergence: firstText,
        };
      }
      continue;
    }

    if (stepA.kind === "tool-result" && stepB.kind === "tool-result") {
      if (stepA.function !== stepB.function || stepA.result !== stepB.result) {
        return {
          kind: "diverged",
          indexA: i,
          indexB: i,
          reason: "tool-result",
          firstTextDivergence: firstText,
        };
      }
      continue;
    }
  }

  if (a.length !== b.length) {
    return {
      kind: "diverged",
      indexA: len,
      indexB: len,
      reason: "length",
      firstTextDivergence: firstText,
    };
  }

  if (firstText) {
    return { kind: "diverged", ...firstText, reason: "assistant-text" };
  }

  return { kind: "identical" };
};
