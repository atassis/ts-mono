import { FC, RefObject, useRef } from "react";

import { TranscriptLayout } from "@tsmono/inspect-components/transcript";
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
        />
      </div>
    </ExtendedFindProvider>
  );
};
