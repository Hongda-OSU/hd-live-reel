import { useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import * as stylex from "@stylexjs/stylex";
import { exportVideo, type Project } from "../api";
import { colors, shadows } from "../tokens.stylex";
import { Button, ui } from "../ui";

type Phase = { step: "form" } | { step: "running" } | { step: "done"; path: string } | { step: "error"; message: string };

const slide = stylex.keyframes({
  from: { transform: "translateX(-100%)" },
  to: { transform: "translateX(290%)" },
});

const styles = stylex.create({
  scrim: {
    position: "absolute",
    inset: 0,
    zIndex: 20,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  dialog: {
    position: "absolute",
    zIndex: 21,
    left: "50%",
    top: "50%",
    width: 380,
    padding: 20,
    borderRadius: 12,
    backgroundColor: colors.window,
    boxShadow: shadows.window,
    transform: "translate(-50%, -50%)",
  },
  heading: {
    margin: "0 0 12px",
    fontSize: 15,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 18,
  },
  track: {
    height: 6,
    margin: "6px 0 10px",
    borderRadius: 99,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  // No real percentage yet, so an indeterminate sweep.
  sweep: {
    display: "block",
    width: "35%",
    height: "100%",
    borderRadius: 99,
    backgroundColor: colors.accent,
    animationName: slide,
    animationDuration: "1.1s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
  done: {
    display: "grid",
    placeItems: "center",
    width: 40,
    height: 40,
    marginBottom: 10,
    borderRadius: "50%",
    backgroundColor: colors.success,
    "::after": {
      content: '""',
      width: 16,
      height: 8,
      borderWidth: "0 0 3px 3px",
      borderStyle: "solid",
      borderColor: "#fff",
      transform: "translateY(-2px) rotate(-45deg)",
    },
  },
});

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
      <div onClick={running ? undefined : onClose} {...stylex.props(styles.scrim)} />
      <div role="dialog" aria-label="导出" {...stylex.props(styles.dialog)}>
        {(phase.step === "form" || phase.step === "error") && (
          <>
            <h2 {...stylex.props(styles.heading)}>导出视频</h2>
            <p {...stylex.props(ui.note)}>
              1080 × 1920 竖屏 · MP4（H.264 + AAC），微信可以直接发送和播放。
              <br />
              保存到「影片 › HD Live Reel」。
            </p>
            {phase.step === "error" && <p {...stylex.props(ui.error)}>{phase.message}</p>}
            <div {...stylex.props(styles.actions)}>
              <Button onClick={onClose}>取消</Button>
              <Button variant="primary" onClick={run}>
                导出
              </Button>
            </div>
          </>
        )}
        {running && (
          <>
            <h2 {...stylex.props(styles.heading)}>正在导出…</h2>
            <div {...stylex.props(styles.track)}>
              <i {...stylex.props(styles.sweep)} />
            </div>
            <p {...stylex.props(ui.note)}>全画质编码，请稍候。</p>
          </>
        )}
        {phase.step === "done" && (
          <>
            <div {...stylex.props(styles.done)} />
            <h2 {...stylex.props(styles.heading)}>导出完成</h2>
            <p {...stylex.props(ui.note)}>{phase.path.split("/").pop()}</p>
            <div {...stylex.props(styles.actions)}>
              <Button onClick={onClose}>完成</Button>
              <Button variant="primary" onClick={() => revealItemInDir(phase.path)}>
                在 Finder 中显示
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
