import { FC } from "react";
import { useSearchParams } from "react-router";

import { useLogDir } from "../../app_config";

import { SideTranscript } from "./SideTranscript";

// Spike (Task 5): proves a sample transcript renders on /compare from an
// explicit ?a=&id=&epoch= — replaced by the two-picker page in a later task.
export const ComparePage: FC = () => {
  const logDir = useLogDir();
  const [params] = useSearchParams();
  const a = params.get("a");
  const id = params.get("id");
  const epoch = Number(params.get("epoch") ?? "1");

  if (!a || !id) {
    return (
      <div>Pass ?a=&lt;log&gt;&amp;id=&lt;sample&gt;&amp;epoch=&lt;n&gt;</div>
    );
  }

  return (
    <SideTranscript
      logDir={logDir}
      logFile={a}
      id={id}
      epoch={epoch}
      side="a"
    />
  );
};
