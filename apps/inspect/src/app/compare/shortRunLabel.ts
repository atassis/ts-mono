import { Log } from "../../client/api/types";

import { distinguishingModelLabel } from "./runPicker";

// Model ids are "<provider>/<name>" (e.g. "openai-api/gemma-26b"); with
// only one column there's no shared-prefix set to compute against, so drop
// just the provider segment.
const dropProvider = (model: string): string => {
  const slash = model.lastIndexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
};

/** Header label for a grid column: short enough for N columns, but the full
 *  model id is still one hover away (title attribute). Shares
 *  `distinguishingModelLabel` with RunPicker so a header and a picker row
 *  never disagree on what makes two models distinguishable — dropping only
 *  the provider segment isn't enough once models nest further, e.g.
 *  "vllm/qwen/3.6-27b-q3" vs "vllm/mistral/small-4" (UX review). */
export const shortRunLabel = (
  log: Log | undefined,
  allModels: string[]
): string => {
  if (!log) return "—";
  if (log.model) {
    return allModels.length >= 2
      ? distinguishingModelLabel(log.model, allModels)
      : dropProvider(log.model);
  }
  return log.task ?? log.name;
};
