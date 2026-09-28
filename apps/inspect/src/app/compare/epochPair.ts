import { EpochCell } from "./sampleGroups";

/** Which pane the next epoch-mark click sets. */
export type PickSide = "a" | "b";

export interface EpochPair {
  epochA: number;
  epochB: number;
}

/** Same log picked for both A and B: comparing two epochs of one run
 *  instead of two runs. */
export const isEpochsMode = (
  a: string | undefined,
  b: string | undefined
): boolean => a !== undefined && a === b;

const toEpoch = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** epochA/epochB URL params, falling back to the sample's own epoch (the
 *  single-epoch behaviour used outside epochs mode) for whichever side has
 *  no explicit param. */
export const resolveEpochPair = (
  epochAParam: string | undefined,
  epochBParam: string | undefined,
  fallbackEpoch: number
): EpochPair => ({
  epochA: toEpoch(epochAParam) ?? fallbackEpoch,
  epochB: toEpoch(epochBParam) ?? fallbackEpoch,
});

/** Default A/B epoch choice for a sample newly opened in epochs mode: the
 *  first passing epoch against the first failing one, so the divergence is
 *  visible immediately. Falls back to the sample's first two epochs when
 *  it doesn't have both a pass and a fail. */
export const defaultEpochPair = (cells: EpochCell[]): EpochPair => {
  const sorted = [...cells].sort((x, y) => x.epoch - y.epoch);
  const pass = sorted.find((c) => c.mark === "pass");
  const fail = sorted.find((c) => c.mark === "fail");
  if (pass && fail) return { epochA: pass.epoch, epochB: fail.epoch };
  return { epochA: sorted[0]?.epoch ?? 1, epochB: sorted[1]?.epoch ?? 2 };
};

/** Alternates which side the next epoch-mark click sets: the first click
 *  sets A, the second sets B, the third sets A again. */
export const nextPickSide = (current: PickSide): PickSide =>
  current === "a" ? "b" : "a";
