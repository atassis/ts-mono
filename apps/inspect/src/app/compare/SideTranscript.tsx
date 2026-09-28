import { FC, RefObject, useRef, useState } from "react";

import {
  TranscriptLayout,
  type TranscriptCollapseState,
  type TranscriptViewNodesHandle,
} from "@tsmono/inspect-components/transcript";
import {
  ErrorPanel,
  ExtendedFindProvider,
  LoadingBar,
} from "@tsmono/react/components";

import { useEvalSampleData } from "../../log_data";

import styles from "./SideTranscript.module.css";

interface SideTranscriptProps {
  logDir: string;
  logFile: string;
  id: string | number;
  epoch: number;
  side: "a" | "b";
  /** The pane that scrolls, for a parent that syncs two panes. */
  paneRef?: RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  /** The transcript list's handle, to locate rows (e.g. anchor offsets). */
  viewNodesRef?: RefObject<TranscriptViewNodesHandle | null>;
}

export const SideTranscript: FC<SideTranscriptProps> = ({
  logDir,
  logFile,
  id,
  epoch,
  side,
  paneRef,
  onScroll,
  viewNodesRef,
}) => {
  const ownRef = useRef<HTMLDivElement>(null);
  const scrollRef = paneRef ?? ownRef;
  const data = useEvalSampleData(logDir, { id, epoch, logFile });

  // Without collapseState the chevrons are no-ops. `ids` starts undefined,
  // not {}: the transcript falls back to its default collapsed set only
  // for a missing map, and seeds those defaults on the first toggle.
  const sampleKey = `${logFile}:${id}:${epoch}`;
  const [collapsed, setCollapsed] = useState<{
    key: string;
    ids: Record<string, boolean> | undefined;
  }>({ key: sampleKey, ids: undefined });
  if (collapsed.key !== sampleKey) {
    setCollapsed({ key: sampleKey, ids: undefined });
  }
  const collapseState: TranscriptCollapseState = {
    transcript: collapsed.ids,
    onCollapseTranscript: (nodeId, isCollapsed) =>
      setCollapsed((prev) => ({
        key: prev.key,
        ids: { ...prev.ids, [nodeId]: isCollapsed },
      })),
    onSetTranscriptCollapsed: (ids) =>
      setCollapsed((prev) => ({ key: prev.key, ids })),
  };

  if (data.error) {
    return (
      <div className={styles.pane}>
        <ErrorPanel
          title="Error"
          error={{ message: data.error.message, stack: data.error.stack }}
        />
      </div>
    );
  }
  if (!data.sample) {
    return (
      <div className={styles.pane}>
        <LoadingBar loading />
      </div>
    );
  }

  return (
    <ExtendedFindProvider>
      <div ref={scrollRef} className={styles.pane} onScroll={onScroll}>
        <TranscriptLayout
          events={data.sample.events}
          scrollRef={scrollRef}
          listId={`compare-${side}`}
          embedded
          timeline={{ showSwimlanes: false }}
          keyboardNavDisabled={true}
          collapseState={collapseState}
          eventsListRef={viewNodesRef}
        />
      </div>
    </ExtendedFindProvider>
  );
};
