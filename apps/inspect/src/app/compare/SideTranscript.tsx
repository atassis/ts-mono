import { FC, RefObject, useRef, useState } from "react";

import {
  TranscriptLayout,
  type TranscriptCollapseState,
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
}

export const SideTranscript: FC<SideTranscriptProps> = ({
  logDir,
  logFile,
  id,
  epoch,
  side,
  paneRef,
  onScroll,
}) => {
  const ownRef = useRef<HTMLDivElement>(null);
  const scrollRef = paneRef ?? ownRef;
  const data = useEvalSampleData(logDir, { id, epoch, logFile });

  // TranscriptLayout's collapse chevrons are no-ops without a collapseState
  // (onCollapseTranscript falls through to nothing — see
  // useTranscriptCollapse). The app-wide store is keyed by the currently
  // selected sample, which this page never sets, so each pane gets its own
  // local state instead. Reset (via key, the sanctioned setState-during-
  // render pattern) when the sample changes, since SideTranscript isn't
  // remounted across sample switches.
  const sampleKey = `${logFile}:${id}:${epoch}`;
  const [collapsed, setCollapsed] = useState<{
    key: string;
    ids: Record<string, boolean>;
  }>(() => ({ key: sampleKey, ids: {} }));
  if (collapsed.key !== sampleKey) {
    setCollapsed({ key: sampleKey, ids: {} });
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
        />
      </div>
    </ExtendedFindProvider>
  );
};
