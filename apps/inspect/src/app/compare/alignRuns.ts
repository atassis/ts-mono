import { ScoreValue } from "../../@types/extraInspect";
import { SampleSummary } from "../../client/api/types";
import { kScoreTypeBoolean, kScoreTypePassFail } from "../../constants";
import { scoreTone } from "../samples/header-v2/scoreTone";

export type CompareCategory =
  | "both-pass"
  | "both-fail"
  | "improved"
  | "regressed"
  | "unchanged"
  | "only-a"
  | "only-b"
  | "error";

export interface AlignedSample {
  key: string;
  id: string | number;
  epoch: number;
  a?: SampleSummary;
  b?: SampleSummary;
  valueA?: ScoreValue;
  valueB?: ScoreValue;
  delta?: number;
  category: CompareCategory;
}

type Outcome = "pass" | "fail" | "other";

// String ids so that 1 and "1" match.
export const sampleKey = (id: string | number, epoch: number): string =>
  `${String(id)}#${epoch}`;

const kPassFailLetters = new Set(["C", "I", "P", "N", "A", "B", "F"]);

// Same heuristic ScoreValueDisplay needs to pick a renderer (circle vs
// text) — there's no score schema here, just the raw value, so infer from
// its shape rather than duplicating this per caller.
export const inferScoreType = (value: ScoreValue | undefined): string => {
  if (typeof value === "boolean") return kScoreTypeBoolean;
  if (typeof value === "string" && kPassFailLetters.has(value.toUpperCase()))
    return kScoreTypePassFail;
  return "";
};

export const outcomeOf = (value: ScoreValue | undefined): Outcome => {
  if (value === undefined) return "other";
  const tone = scoreTone(value, inferScoreType(value));
  if (tone === "pass") return "pass";
  if (tone === "fail") return "fail";
  return "other";
};

export const firstCommonScorer = (
  a: SampleSummary[],
  b: SampleSummary[]
): string | undefined => {
  const inB = new Set<string>();
  for (const sample of b) {
    for (const name of Object.keys(sample.scores ?? {})) inB.add(name);
  }
  for (const sample of a) {
    for (const name of Object.keys(sample.scores ?? {})) {
      if (inB.has(name)) return name;
    }
  }
  return undefined;
};

const valueOf = (
  sample: SampleSummary | undefined,
  scorer: string | undefined
): ScoreValue | undefined =>
  scorer === undefined ? undefined : sample?.scores?.[scorer]?.value;

const isFiniteNumberString = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed !== "" && Number.isFinite(Number(trimmed));
};

// Mirrors inspect_ai's value_to_float (scorer/_metric.py): C/P/I/N are
// exact-case sentinels checked before any type coercion, so lowercase
// letters fall through to the string branch below (and, unlike Python,
// unmappable values return undefined instead of a 0.0 fallback).
export const toNumber = (value: ScoreValue | undefined): number | undefined => {
  if (value === "C") return 1;
  if (value === "P") return 0.5;
  if (value === "I" || value === "N") return 0;
  if (typeof value === "number" || typeof value === "boolean")
    return Number(value);
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "yes" || lower === "true") return 1;
    if (lower === "no" || lower === "false") return 0;
    if (isFiniteNumberString(value)) return Number(value);
  }
  return undefined;
};

const classify = (
  a: SampleSummary | undefined,
  b: SampleSummary | undefined,
  valueA: ScoreValue | undefined,
  valueB: ScoreValue | undefined
): { category: CompareCategory; delta?: number } => {
  if (!b) return { category: "only-a" };
  if (!a) return { category: "only-b" };
  // Errors win over scores: a sample that errored has no meaningful outcome.
  if (a.error || b.error) return { category: "error" };

  const oa = outcomeOf(valueA);
  const ob = outcomeOf(valueB);
  if (oa !== "other" && ob !== "other") {
    if (oa === ob)
      return { category: oa === "pass" ? "both-pass" : "both-fail" };
    return { category: ob === "pass" ? "improved" : "regressed" };
  }

  const na = toNumber(valueA);
  const nb = toNumber(valueB);
  if (na !== undefined && nb !== undefined) {
    const delta = nb - na;
    if (delta > 0) return { category: "improved", delta };
    if (delta < 0) return { category: "regressed", delta };
    return { category: "unchanged", delta };
  }

  return { category: "unchanged" };
};

export const alignRuns = (
  a: SampleSummary[],
  b: SampleSummary[],
  scorer: string | undefined
): AlignedSample[] => {
  const byKeyB = new Map<string, SampleSummary>();
  for (const sample of b)
    byKeyB.set(sampleKey(sample.id, sample.epoch), sample);

  const rows: AlignedSample[] = [];
  const seen = new Set<string>();
  const push = (
    sa: SampleSummary | undefined,
    sb: SampleSummary | undefined
  ): void => {
    const base = sa ?? sb;
    if (!base) return;
    const key = sampleKey(base.id, base.epoch);
    seen.add(key);
    const valueA = valueOf(sa, scorer);
    const valueB = valueOf(sb, scorer);
    rows.push({
      key,
      id: base.id,
      epoch: base.epoch,
      a: sa,
      b: sb,
      valueA,
      valueB,
      ...classify(sa, sb, valueA, valueB),
    });
  };

  for (const sa of a) push(sa, byKeyB.get(sampleKey(sa.id, sa.epoch)));
  for (const sb of b) {
    if (!seen.has(sampleKey(sb.id, sb.epoch))) push(undefined, sb);
  }
  return rows;
};
