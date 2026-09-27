import { SampleSummary } from "../../client/api/types";

// Mirrors EvalSampleLimit.type (packages/inspect-common/src/types/generated.ts)
// — the schema's full set of limit kinds. SampleSummary.limit is a plain
// string (not narrowed to this union), so unrecognized values map to
// "other" rather than being dropped.
export type LimitKind =
  | "context"
  | "time"
  | "working"
  | "message"
  | "token"
  | "turn"
  | "cost"
  | "operator"
  | "custom";

// Widened to ReadonlySet<string> (rather than Set<LimitKind>) so the type
// guard below can query it with an arbitrary string, with no cast.
const kLimitKinds: ReadonlySet<string> = new Set([
  "context",
  "time",
  "working",
  "message",
  "token",
  "turn",
  "cost",
  "operator",
  "custom",
]);

const isLimitKind = (value: string): value is LimitKind =>
  kLimitKinds.has(value);

interface FailureKindBase {
  // Present only when the summary reports at least one retry. Orthogonal to
  // `kind`: a sample can retry and still error, or retry and still hit a
  // limit, so this rides alongside rather than competing for precedence.
  retries?: number;
}

export type FailureKind =
  | ({ kind: "none" } & FailureKindBase)
  | ({ kind: "error"; message: string } & FailureKindBase)
  | ({
      kind: "limit";
      limit: LimitKind | "other";
      raw: string;
      reason?: string;
    } & FailureKindBase);

/**
 * Classifies why a sample's score may not reflect model performance on
 * merit. Precedence: error > limit > none — a sample can carry both an
 * error and a limit (e.g. it errored while over the message limit), and
 * the error is treated as the dominant infra failure since it's the one
 * that stopped scoring outright. `retries` is reported alongside any kind.
 */
export const failureKind = (summary: SampleSummary): FailureKind => {
  const retries =
    summary.retries !== undefined &&
    summary.retries !== null &&
    summary.retries > 0
      ? summary.retries
      : undefined;

  if (summary.error) {
    return { kind: "error", message: summary.error, retries };
  }
  if (summary.limit) {
    const limit = isLimitKind(summary.limit) ? summary.limit : "other";
    return {
      kind: "limit",
      limit,
      raw: summary.limit,
      reason: summary.limit_reason ?? undefined,
      retries,
    };
  }
  return { kind: "none", retries };
};

export interface PairFailureExplanation {
  // False when either side's outcome is explained by infra rather than
  // model behavior — the regression/improvement isn't a fair comparison.
  onMerit: boolean;
  a?: FailureKind;
  b?: FailureKind;
}

/**
 * For an aligned A/B pair, says whether the pair's outcome should be read
 * on merit or is explained by an error/limit on one (or both) sides.
 */
export const explainPair = (row: {
  a?: SampleSummary;
  b?: SampleSummary;
}): PairFailureExplanation => {
  const a = row.a ? failureKind(row.a) : undefined;
  const b = row.b ? failureKind(row.b) : undefined;
  const flaggedA = a && a.kind !== "none" ? a : undefined;
  const flaggedB = b && b.kind !== "none" ? b : undefined;
  return { onMerit: !flaggedA && !flaggedB, a: flaggedA, b: flaggedB };
};
