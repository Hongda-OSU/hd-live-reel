import { useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { exportVideo, type Project } from "../api";

type Phase = { step: "form" } | { step: "running" } | { step: "done"; path: string } | { step: "error"; message: string };

interface Props {
  open: boolean;
  project: Project;
  onClose: () => void;
}

export function ExportDialog({ open, project, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ step: "form" });

  useEffect(() => {
    if (open) setPhase({ step: "form" });
  }, [open]);

  async function run() {
    setPhase({ step: "running" });
    try {
      setPhase({ step: "done", path: await exportVideo(project) });
    } catch (e) {
      setPhase({ step: "error", message: String(e) });
    }
  }

  if (!open) return null;
  const running = phase.step === "running";
  return (
    <>
      <div className="dialog-scrim" onClick={running ? undefined : onClose} />
      <div className="dialog" role="dialog" aria-label="导出">
        {(phase.step === "form" || phase.step === "error") && (
          <>
            <h2>导出视频</h2>
            <p className="note">
              1080 × 1920 竖屏 · MP4（H.264 + AAC），微信可以直接发送和播放。
              <br />
              保存到「影片 › HD Live Reel」。
            </p>
            {phase.step === "error" && <p className="error">{phase.message}</p>}
            <div className="actions">
              <button className="btn" onClick={onClose}>
                取消
              </button>
              <button className="btn primary" onClick={run}>
                导出
              </button>
            </div>
          </>
        )}
        {running && (
          <>
            <h2>正在导出…</h2>
            <div className="progress indeterminate">
              <i />
            </div>
            <p className="note">全画质编码，请稍候。</p>
          </>
        )}
        {phase.step === "done" && (
          <>
            <div className="done-mark" />
            <h2>导出完成</h2>
            <p className="note">{phase.path.split("/").pop()}</p>
            <div className="actions">
              <button className="btn" onClick={onClose}>
                完成
              </button>
              <button className="btn primary" onClick={() => revealItemInDir(phase.path)}>
                在 Finder 中显示
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
