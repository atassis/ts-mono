import type { EvalConfig, EvalSpec } from "@tsmono/inspect-common/types";

/** A formatted config value: either a short display string, or (for values
 *  too long to show inline, e.g. a system prompt) a hash-tagged label with
 *  the full text as a tooltip. */
export type DiffValue =
  | { kind: "text"; text: string }
  | { kind: "hashed"; text: string; tooltip: string };

export interface ConfigDiffEntry {
  /** Dotted path, e.g. "model_generate_config.temperature". */
  path: string;
  a: DiffValue;
  b: DiffValue;
}

const LONG_VALUE_THRESHOLD = 60;

// djb2 — sync, deterministic, collision rate doesn't matter (a visual tag,
// not an identity key). Long enough (6 hex chars) to tell two truncated
// values apart at a glance without dumping their content.
const shortHash = (text: string): string => {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(6, "0").slice(0, 6);
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

// Sorted keys so two objects with identical content but different insertion
// order (e.g. task_args round-tripped through JSON) compare and format equal.
const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    isPlainObject(v) ? Object.fromEntries(Object.entries(v).sort()) : v
  );

export const formatDiffValue = (raw: unknown): DiffValue => {
  if (raw === undefined || raw === null)
    return { kind: "text", text: "(default)" };
  const text =
    typeof raw === "string"
      ? raw
      : typeof raw === "number" || typeof raw === "boolean"
        ? String(raw)
        : stableStringify(raw);
  if (text.length <= LONG_VALUE_THRESHOLD) return { kind: "text", text };
  return {
    kind: "hashed",
    text: `changed (#${shortHash(text)})`,
    tooltip: text,
  };
};

const deepEqual = (x: unknown, y: unknown): boolean => {
  if (x === y) return true;
  if (x === null || y === null || x === undefined || y === undefined)
    return false;
  if (typeof x !== "object" || typeof y !== "object") return false;
  return stableStringify(x) === stableStringify(y);
};

const flattenLeaf = (
  obj: Record<string, unknown> | null | undefined
): Record<string, unknown> => {
  if (!obj) return {};
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
};

const prefixKeys = (
  prefix: string,
  obj: Record<string, unknown>
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [`${prefix}.${k}`, v])
  );

/** Curated, in priority order — not every `EvalConfig` field, only the ones
 *  that change what the eval actually ran (excludes logging/UI knobs like
 *  `log_buffer`, `score_display`). */
const limitsOf = (config: EvalConfig): Record<string, unknown> =>
  flattenLeaf({
    epochs: config.epochs,
    epochs_reducer: config.epochs_reducer,
    limit: config.limit,
    message_limit: config.message_limit,
    time_limit: config.time_limit,
    token_limit: config.token_limit,
    token_limit_type: config.token_limit_type,
    turn_limit: config.turn_limit,
    working_limit: config.working_limit,
    max_samples: config.max_samples,
    cost_limit: config.cost_limit,
    sample_shuffle: config.sample_shuffle,
    sample_id: config.sample_id,
  });

interface Group {
  extract: (spec: EvalSpec) => Record<string, unknown>;
}

// Order here IS the priority order entries come back in — most likely to
// explain a score difference first (model/generation config), least likely
// last (package pins, free-form metadata).
const GROUPS: Group[] = [
  {
    extract: (e) =>
      flattenLeaf({ model: e.model, model_base_url: e.model_base_url }),
  },
  {
    extract: (e) =>
      prefixKeys("model_generate_config", flattenLeaf(e.model_generate_config)),
  },
  {
    extract: (e) => prefixKeys("task_args", flattenLeaf(e.task_args_passed)),
  },
  {
    extract: (e) =>
      flattenLeaf({
        solver: e.solver,
        ...prefixKeys("solver_args", flattenLeaf(e.solver_args_passed)),
      }),
  },
  {
    extract: (e) => prefixKeys("config", limitsOf(e.config)),
  },
  {
    extract: (e) =>
      flattenLeaf({
        "dataset.name": e.dataset.name,
        "dataset.samples": e.dataset.samples,
        "dataset.shuffled": e.dataset.shuffled,
      }),
  },
  {
    extract: (e) =>
      e.revision
        ? flattenLeaf({
            "revision.commit": e.revision.commit,
            "revision.origin": e.revision.origin,
            "revision.dirty": e.revision.dirty,
          })
        : {},
  },
  {
    extract: (e) => prefixKeys("packages", flattenLeaf(e.packages)),
  },
  {
    extract: (e) =>
      prefixKeys("metadata", flattenLeaf(e.metadata ?? undefined)),
  },
];

/**
 * Config differences between two runs' `EvalSpec`s, flattened to dotted
 * paths and ordered by how likely they are to explain a score difference
 * (model first, free-form metadata last). Identity/volatile fields
 * (eval_id, run_id, created, task_id, task_file, timestamps) are never
 * inspected — they aren't in any group's extractor.
 *
 * `undefined` for either side means its header hasn't loaded yet — callers
 * should treat that as "unknown", not "no differences".
 */
export const diffEvalConfig = (
  specA: EvalSpec | undefined,
  specB: EvalSpec | undefined
): ConfigDiffEntry[] => {
  if (!specA || !specB) return [];
  const entries: ConfigDiffEntry[] = [];
  for (const group of GROUPS) {
    const a = group.extract(specA);
    const b = group.extract(specB);
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const key of keys) {
      if (deepEqual(a[key], b[key])) continue;
      entries.push({
        path: key,
        a: formatDiffValue(a[key]),
        b: formatDiffValue(b[key]),
      });
    }
  }
  return entries;
};
