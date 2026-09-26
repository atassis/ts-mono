import { useQueries } from "@tanstack/react-query";

import { AsyncData, loading } from "@tsmono/util";

import { SampleSummary } from "../client/api/types";

import { resolveLogKey } from "./logsContent";
import { samplesListingDirKey } from "./samplesListing";
import { getSampleSummaries } from "./sampleSummaries";

/**
 * `useSampleSummaries` for N logs at once (the runs grid). `useQueries`
 * rather than N `useSampleSummaries` calls: the number of runs is dynamic
 * (rules of hooks forbid a variable-length list of hook calls), and
 * `useQueries` is React Query's supported way to run a dynamic list of
 * queries as a single hook.
 *
 * Reads through {@link getSampleSummaries} (settled summaries + pending
 * buffer), the same non-React snapshot the pairwise page's data ultimately
 * bottoms out on — but it does not subscribe to the ingestion sink's live
 * push/invalidate path the way `useSampleSummaries` does, so a run that is
 * still streaming in won't update here until something else invalidates
 * the query. Fine for the grid's target case (comparing completed runs);
 * revisit if the grid needs to watch in-progress runs.
 */
export const useSampleSummariesMany = (
  logDir: string,
  logFiles: readonly string[]
): AsyncData<SampleSummary[]>[] => {
  const results = useQueries({
    queries: logFiles.map((logFile) => ({
      queryKey: [
        ...samplesListingDirKey(logDir),
        "runs-grid",
        resolveLogKey(logDir, logFile),
      ] as const,
      queryFn: () => getSampleSummaries(logDir, logFile),
      staleTime: Infinity,
    })),
  });

  return results.map((result): AsyncData<SampleSummary[]> => {
    if (result.isPending) return loading;
    if (result.isError) return { error: result.error, loading: false };
    return { data: result.data, loading: false };
  });
};
