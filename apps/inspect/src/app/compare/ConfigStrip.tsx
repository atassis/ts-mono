import { FC, useState } from "react";

import { Log } from "../../client/api/types";
import { useLogHeader } from "../../log_data";

import { ConfigDiffEntry, diffEvalConfig } from "./configDiff";
import styles from "./ConfigStrip.module.css";
import { runDirLabel } from "./runPicker";

interface ConfigStripProps {
  logDir: string;
  fileA: string;
  fileB: string;
  logA: Log | undefined;
  logB: Log | undefined;
  scorer: string | undefined;
}

const COLLAPSED_COUNT = 4;

const DiffValueSpan: FC<{ value: ConfigDiffEntry["a"] }> = ({ value }) =>
  value.kind === "hashed" ? (
    <span className={styles.hashed} title={value.tooltip}>
      {value.text}
    </span>
  ) : (
    <span className={styles.value}>{value.text}</span>
  );

/**
 * Compact "what varies, what's fixed, what else differs" summary for the
 * pairwise compare page. Owns its own header fetch (like `SideTranscript`)
 * so mounting it is the only thing `ComparePage` needs to do.
 */
export const ConfigStrip: FC<ConfigStripProps> = ({
  logDir,
  fileA,
  fileB,
  logA,
  logB,
  scorer,
}) => {
  const [expanded, setExpanded] = useState(false);
  const headerA = useLogHeader(logDir, fileA, { demand: "passive" });
  const headerB = useLogHeader(logDir, fileB, { demand: "passive" });
  const evalA = headerA.data?.eval;
  const evalB = headerB.data?.eval;
  const entries = diffEvalConfig(evalA, evalB);
  const shown = expanded ? entries : entries.slice(0, COLLAPSED_COUNT);
  const hidden = entries.length - shown.length;

  const task = evalA?.task ?? evalB?.task ?? logA?.task ?? logB?.task;
  const samples =
    evalA?.dataset.samples ??
    headerA.data?.sampleCount ??
    evalB?.dataset.samples;
  const epochs = evalA?.config.epochs ?? evalB?.config.epochs ?? 1;

  return (
    <div className={styles.strip}>
      <span className={styles.line}>
        <span className={styles.label}>Varying:</span> run
        <span className={styles.value}>
          A = {logA ? runDirLabel(logA, logDir) : "—"}
        </span>
        <span className={styles.sep}>·</span>
        <span className={styles.value}>
          B = {logB ? runDirLabel(logB, logDir) : "—"}
        </span>
      </span>
      <span className={styles.line}>
        <span className={styles.label}>Fixed:</span>
        {task ? <span className={styles.value}>task {task}</span> : null}
        {scorer ? (
          <>
            <span className={styles.sep}>·</span>
            <span className={styles.value}>scorer {scorer}</span>
          </>
        ) : null}
        {samples !== undefined ? (
          <>
            <span className={styles.sep}>·</span>
            <span className={styles.value}>
              {samples} samples × {epochs} epoch{epochs === 1 ? "" : "s"}
            </span>
          </>
        ) : null}
      </span>
      <span className={styles.line}>
        <span className={styles.label}>Differs:</span>
        {!evalA || !evalB ? (
          <span className={styles.noDiff}>loading…</span>
        ) : entries.length === 0 ? (
          <span className={styles.noDiff}>No config differences</span>
        ) : (
          <>
            {shown.map((entry, i) => (
              <span key={entry.path} className={styles.value}>
                {i > 0 ? <span className={styles.sep}>·</span> : null}{" "}
                {entry.path} <DiffValueSpan value={entry.a} /> {"→"}{" "}
                <DiffValueSpan value={entry.b} />
              </span>
            ))}
            {hidden > 0 ? (
              <button
                type="button"
                className={styles.more}
                onClick={() => setExpanded(true)}
              >
                +{hidden} more
              </button>
            ) : expanded && entries.length > COLLAPSED_COUNT ? (
              <button
                type="button"
                className={styles.more}
                onClick={() => setExpanded(false)}
              >
                show fewer
              </button>
            ) : null}
          </>
        )}
      </span>
    </div>
  );
};
