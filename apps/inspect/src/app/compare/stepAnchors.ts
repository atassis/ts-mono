import { Event } from "@tsmono/inspect-common/types";

import { classifyToolCall, ToolActionClass } from "./divergence";

export interface StepAnchor {
  /** Index into the sample's `events` array — what a viewer scrolls to. */
  eventIndex: number;
  eventId: string | undefined;
  signature: string;
  label: string;
}

interface CallSummary {
  function: string;
  actionClass: ToolActionClass;
}

const callSummariesOf = (
  event: Extract<Event, { event: "model" }>
): CallSummary[] => {
  const calls = event.output.choices[0]?.message.tool_calls ?? [];
  return calls.map((call) => ({
    function: call.function,
    actionClass: classifyToolCall(call.function, call.arguments),
  }));
};

// "function:actionClass" pairs joined by "|" — parsed back into an action-
// class set by alignAnchors for weak matching, so the format only needs to
// be internally consistent, not human-facing (label is what's shown).
const signatureOf = (calls: CallSummary[]): string =>
  calls.length === 0
    ? "text"
    : calls.map((call) => `${call.function}:${call.actionClass}`).join("|");

const labelOf = (calls: CallSummary[]): string =>
  calls.length === 0
    ? "text"
    : calls.map((call) => `${call.function}: ${call.actionClass}`).join(", ");

/** One anchor per `model` event, in transcript order. */
export const anchorsOf = (events: Event[]): StepAnchor[] => {
  const anchors: StepAnchor[] = [];
  events.forEach((event, eventIndex) => {
    if (event.event !== "model") return;
    const calls = callSummariesOf(event);
    anchors.push({
      eventIndex,
      eventId: event.uuid ?? undefined,
      signature: signatureOf(calls),
      label: labelOf(calls),
    });
  });
  return anchors;
};

export interface AnchorPair {
  a: number;
  b: number;
}

// Action class is whatever follows the last ":" in a "function:actionClass"
// entry — function names never contain ":", so this recovers the class
// without re-deriving it from the raw event.
const actionClassSetOf = (signature: string): Set<string> =>
  signature === "text"
    ? new Set()
    : new Set(
        signature
          .split("|")
          .map((entry) => entry.slice(entry.lastIndexOf(":") + 1))
      );

const setsEqual = (x: Set<string>, y: Set<string>): boolean =>
  x.size === y.size && [...x].every((value) => y.has(value));

// 2 = exact signature match, 1 = same set of action classes (weak match),
// 0 = no pairing.
const matchScore = (x: StepAnchor, y: StepAnchor): number => {
  if (x.signature === y.signature) return 2;
  if (setsEqual(actionClassSetOf(x.signature), actionClassSetOf(y.signature)))
    return 1;
  return 0;
};

/**
 * Global alignment (Needleman-Wunsch over match score, no gap penalty):
 * maximizes the total match score of a strictly-increasing pairing.
 * Unpaired anchors on either side are the insertions/deletions.
 *
 * Tie rule (determinism): when a diagonal match ties with skipping either
 * side, the match wins; when two skips tie, advancing `a` wins over
 * advancing `b`.
 */
export const alignAnchors = (
  a: StepAnchor[],
  b: StepAnchor[]
): AnchorPair[] => {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  const at = (i: number, j: number): number => dp[i]?.[j] ?? 0;

  for (let i = 1; i <= n; i++) {
    const anchorA = a[i - 1];
    const row = dp[i];
    if (anchorA === undefined || row === undefined) continue;
    for (let j = 1; j <= m; j++) {
      const anchorB = b[j - 1];
      if (anchorB === undefined) continue;
      const score = matchScore(anchorA, anchorB);
      const diag = score > 0 ? at(i - 1, j - 1) + score : -Infinity;
      row[j] = Math.max(diag, at(i - 1, j), at(i, j - 1));
    }
  }

  const pairs: AnchorPair[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const anchorA = a[i - 1];
    const anchorB = b[j - 1];
    if (anchorA === undefined || anchorB === undefined) break;
    const score = matchScore(anchorA, anchorB);
    if (score > 0 && at(i, j) === at(i - 1, j - 1) + score) {
      pairs.push({ a: i - 1, b: j - 1 });
      i--;
      j--;
      continue;
    }
    if (at(i, j) === at(i - 1, j)) {
      i--;
    } else {
      j--;
    }
  }
  pairs.reverse();
  return pairs;
};
