import { AnchorOffsets } from "./anchorSync";
import { Position, segmentMode } from "./scrollMap";
import { AnchorPair } from "./stepAnchors";

export interface SyncStatus {
  /** 1-based model turn of the common step at or above the top; undefined
   *  before the first one. */
  stepA: number | undefined;
  stepB: number | undefined;
  /** The side resting at its step while the other reads on. */
  resting: "a" | "b" | undefined;
  /** Turns in this stretch with no match on the other side. */
  extraA: number;
  extraB: number;
  /** Past the last common step. */
  tail: boolean;
}

/** `pairs` are the pairs behind `offsets`: offsets[k] for k in 1..n-2 is
 *  pairs[k - 1]; offsets[0] and the last entry frame the panes. */
export const syncStatus = (
  pos: Position,
  offsets: AnchorOffsets,
  pairs: AnchorPair[],
  turnsA: number,
  turnsB: number,
  ratio: number = 3
): SyncStatus => {
  const k = Math.min(Math.max(pos.k, 0), offsets.a.length - 2);
  const prev = pairs[k - 1] ?? { a: -1, b: -1 };
  const next = pairs[k] ?? { a: turnsA, b: turnsB };
  const la = (offsets.a[k + 1] ?? 0) - (offsets.a[k] ?? 0);
  const lb = (offsets.b[k + 1] ?? 0) - (offsets.b[k] ?? 0);
  const lmax = Math.max(la, lb);
  const pausing = segmentMode(la, lb, ratio) === "pause";
  const rests = (l: number) => pausing && l < lmax && pos.t * lmax >= l - 0.5;
  const resting = rests(la) ? "a" : rests(lb) ? "b" : undefined;
  const tail = k >= pairs.length;
  // A resting side has already reached the step that closes this stretch.
  const step = (side: "a" | "b", before: number, after: number) =>
    resting === side && !tail ? after + 1 : k > 0 ? before + 1 : undefined;
  return {
    stepA: step("a", prev.a, next.a),
    stepB: step("b", prev.b, next.b),
    resting,
    extraA: next.a - prev.a - 1,
    extraB: next.b - prev.b - 1,
    tail,
  };
};
