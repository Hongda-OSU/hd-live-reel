import { useState } from "react";
import { cancelExport, EXPORT_CANCELLED, exportVideo, onExportProgress, type Project } from "../api";

export type ExportPhase =
  | { step: "idle" }
  | {
      step: "running";
      progress: number;
      /** Seconds left, once enough is done to estimate it. */
      remaining: number | null;
      cancelling: boolean;
    }
  | { step: "done"; path: string }
  | { step: "error"; message: string };

/** The rate is too noisy to extrapolate before this much is done. */
const MIN_FOR_ESTIMATE = { share: 0.05, seconds: 2 };

function estimateRemaining(progress: number, startedAt: number): number | null {
  const elapsed = (Date.now() - startedAt) / 1000;
  if (progress < MIN_FOR_ESTIMATE.share || elapsed < MIN_FOR_ESTIMATE.seconds) return null;
  return (elapsed * (1 - progress)) / progress;
}

/** Friendlier wording for failures the user can fix themselves. */
function explain(message: string) {
  return message.startsWith("export folder not found")
    ? "导出位置不可用（文件夹被移走，或外接硬盘没有接上）。请在上面「保存到」里更改位置。"
    : message;
}

/** One export at a time, kept above the 导出 page so switching pages
 * mid-export loses nothing. */
export function useExport() {
  const [phase, setPhase] = useState<ExportPhase>({ step: "idle" });

  async function start(project: Project) {
    const startedAt = Date.now();
    setPhase({ step: "running", progress: 0, remaining: null, cancelling: false });
    const unlisten = await onExportProgress((progress) =>
      setPhase((p) =>
        p.step === "running" ? { ...p, progress, remaining: estimateRemaining(progress, startedAt) } : p,
      ),
    );
    try {
      setPhase({ step: "done", path: await exportVideo(project) });
    } catch (e) {
      // A cancel just goes back to the form; nothing was saved.
      setPhase(String(e) === EXPORT_CANCELLED ? { step: "idle" } : { step: "error", message: explain(String(e)) });
    } finally {
      unlisten();
    }
  }

  function cancel() {
    setPhase((p) => (p.step === "running" ? { ...p, cancelling: true } : p));
    void cancelExport();
  }

  /** Back to the form after a finished or failed export. */
  const reset = () => setPhase({ step: "idle" });

  return { phase, start, cancel, reset };
}

export type Exporter = ReturnType<typeof useExport>;
