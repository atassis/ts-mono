import { FC, useRef } from "react";

import { TranscriptLayout } from "@tsmono/inspect-components/transcript";
import { ExtendedFindProvider } from "@tsmono/react/components";

import { useEvalSampleData } from "../../log_data";

import styles from "./SideTranscript.module.css";

interface SideTranscriptProps {
  logDir: string;
  logFile: string;
  id: string | number;
  epoch: number;
  side: "a" | "b";
}

export const SideTranscript: FC<SideTranscriptProps> = ({
  logDir,
  logFile,
  id,
  epoch,
  side,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const data = useEvalSampleData(logDir, { id, epoch, logFile });

  if (data.error) {
    return <div className={styles.pane}>Error: {data.error.message}</div>;
  }
  if (!data.sample) {
    return <div className={styles.pane}>Loading…</div>;
  }

  return (
    <ExtendedFindProvider>
      <div ref={scrollRef} className={styles.pane}>
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
