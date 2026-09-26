import { Log } from "../../client/api/types";

// Model ids are "<provider>/<name>" (e.g. "openai-api/gemma-26b"); the
// provider prefix is noise in a header that must fit many columns, and it's
// the same across most rows in one comparison.
const dropProvider = (model: string): string => {
  const slash = model.lastIndexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
};

/** Header label for a grid column: short enough for N columns, but the full
 *  model id is still one hover away (title attribute) — CSS truncation
 *  alone hid distinguishing suffixes like qwen3.5 vs qwen3.6 (UX review). */
export const shortRunLabel = (log: Log | undefined): string => {
  if (!log) return "—";
  if (log.model) return dropProvider(log.model);
  return log.task ?? log.name;
};
